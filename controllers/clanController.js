const Clan = require('../models/Clan');
const User = require('../models/User');
const ClanInvite = require('../models/ClanInvite');
const ClanJoinRequest = require('../models/ClanJoinRequest');
const ClanLog = require('../models/ClanLog');
const { del } = require('../services/redis');

const MAX_MEMBERS = 50;

/**
 * Calculates clan level based on total influence points
 * Level 1: 0 - 4,999
 * Level 2: 5,000 - 14,999
 * Level 3: 15,000 - 29,999
 * Level 4: 30,000 - 59,999
 * Level 5+: 60,000+
 */
const calculateClanLevel = (points) => {
    if (points >= 60000) return Math.floor(5 + (points - 60000) / 50000);
    if (points >= 30000) return 4;
    if (points >= 15000) return 3;
    if (points >= 5000) return 2;
    return 1;
};

const slugify = (text) => {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-');
};

exports.createClan = async (req, res) => {
    try {
        const { name, tag, description } = req.body;
        const userId = req.user.id;

        if (!name || !tag) {
            return res.status(400).json({ message: 'Name and Tag are required.' });
        }

        if (name.length > 25) {
            return res.status(400).json({ message: 'Name too long. Maximum 25 characters permitted.' });
        }

        const tagClean = tag.trim().toUpperCase();
        if (tagClean.length < 2 || tagClean.length > 5) {
            return res.status(400).json({ message: 'Tag must be between 2 and 5 characters.' });
        }

        if (!/^[A-Z0-9]+$/.test(tagClean)) {
            return res.status(400).json({ message: 'Tag must be alphanumeric (no special symbols).' });
        }

        if (description && description.length > 200) {
            return res.status(400).json({ message: 'Description too long. Maximum 200 characters permitted.' });
        }

        const user = await User.findById(userId);
        if (user.clanId) {
            return res.status(400).json({ message: 'You are already in a clan.' });
        }

        if (user.lastClanCreatedAt) {
            const oneWeekInMs = 7 * 24 * 60 * 60 * 1000;
            const timeSinceLastCreation = Date.now() - new Date(user.lastClanCreatedAt).getTime();
            if (timeSinceLastCreation < oneWeekInMs) {
                const daysRemaining = Math.ceil((oneWeekInMs - timeSinceLastCreation) / (1000 * 60 * 60 * 24));
                return res.status(403).json({ message: `Divisional establishment restricted. Protocol requires a cooldown period. Try again in ${daysRemaining} day(s).` });
            }
        }

        const existingClan = await Clan.findOne({ $or: [{ name }, { tag: tag.toUpperCase() }] });
        if (existingClan) {
            return res.status(400).json({ message: 'Clan name or Tag already exists.' });
        }

        const clan = new Clan({
            name,
            slug: slugify(name),
            tag: tag.toUpperCase(),
            description,
            leader: userId,
            members: [userId]
        });

        await clan.save();

        user.clanId = clan._id;
        user.clanRole = 'leader';
        user.lastClanCreatedAt = new Date();
        await user.save();

        await del(`user:session:${userId}`).catch(() => { });
        await del('clan:leaderboard').catch(() => { });

        res.status(201).json({ status: 'success', data: clan });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error creating clan.' });
    }
};

exports.getClanDetails = async (req, res) => {
    try {
        const identifier = req.params.id;

        let query = { slug: identifier };
        if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
            query = { $or: [{ slug: identifier }, { _id: identifier }] };
        }

        const clan = await Clan.findOne(query)
            .populate('leader', 'nickname')
            .populate('members', 'nickname role lastSolvedDate');

        if (!clan) {
            return res.status(404).json({ message: 'Tactical division not found.' });
        }

        const DuelProfile = require('../models/DuelProfile');
        const memberIds = clan.members.map(m => m._id);
        const profiles = await DuelProfile.find({ user: { $in: memberIds } });

        const membersWithStats = clan.members.map(member => {
            const profile = profiles.find(p => p.user.toString() === member._id.toString());

            let eloSum = 0;
            let eloCount = 0;

            if (profile) {
                if (profile.elo) {
                    eloSum += profile.elo;
                    eloCount++;
                }

                if (profile.survivalElo) {
                    eloSum += profile.survivalElo;
                    eloCount++;
                }

                if (profile.domainStats) {
                    for (const stats of profile.domainStats.values()) {
                        if (stats.elo) {
                            eloSum += stats.elo;
                            eloCount++;
                        }
                    }
                }
            }

            const compositeElo = eloCount > 0 ? Math.round(eloSum / eloCount) : 1000;

            return {
                ...member.toObject(),
                survivalElo: profile?.survivalElo || 1000,
                survivalRank: profile?.survivalRank || 'Recruit',
                compositeElo: compositeElo,
                totalDuels: profile?.totalDuels || 0
            };
        });

        const clanData = clan.toObject();
        clanData.members = membersWithStats;

        if (!clan.slug) {
            clan.slug = slugify(clan.name);
            await clan.save();
            clanData.slug = clan.slug;
        }

        res.status(200).json({ status: 'success', data: clanData });
    } catch (err) {
        res.status(500).json({ message: 'Error retrieving division intelligence.' });
    }
};

exports.getClanLeaderboard = async (req, res) => {
    try {
        const { getJson } = require('../services/redis');
        const cachedLeaderboard = await getJson('clan:leaderboard').catch(() => null);

        if (cachedLeaderboard) {
            return res.status(200).json({
                status: 'success',
                ...cachedLeaderboard,
                _cached: true
            });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const totalClans = await Clan.countDocuments();
        const totalPages = Math.ceil(totalClans / limit);

        const leaderboard = await Clan.find()
            .sort({ weeklyPoints: -1 })
            .skip(skip)
            .limit(limit)
            .select('name slug tag weeklyPoints totalPoints level members')
            .lean();

        const enrichedLeaderboard = leaderboard.map(c => ({
            ...c,
            memberCount: c.members?.length || 0
        }));

        const responseData = {
            data: enrichedLeaderboard,
            pagination: {
                totalClans,
                totalPages,
                currentPage: page,
                limit
            }
        };

        const { setJson } = require('../services/redis');
        await setJson('clan:leaderboard', responseData, 120).catch(() => { });

        res.status(200).json({
            status: 'success',
            ...responseData
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching leaderboard.' });
    }
};

exports.inviteToClan = async (req, res) => {
    try {
        const { inviteeEmail } = req.body;
        const inviterId = req.user.id;

        const inviter = await User.findById(inviterId);
        if (inviter.clanRole !== 'leader') {
            return res.status(403).json({ message: 'Only clan leaders can invite members.' });
        }

        const clan = await Clan.findById(inviter.clanId);
        if (!clan) {
            return res.status(404).json({ message: 'Tactical division registry not found.' });
        }

        if (clan.members.length >= MAX_MEMBERS) {
            return res.status(400).json({ message: `Divisional capacity reached. Maximum ${MAX_MEMBERS} survivors allowed.` });
        }

        const invitee = await User.findOne({ email: inviteeEmail.toLowerCase() });
        if (!invitee) {
            return res.status(404).json({ message: 'Survivor with this email not found in the Arena.' });
        }

        if (invitee.clanId) {
            return res.status(400).json({ message: 'User is already in a clan.' });
        }

        const existingInvite = await ClanInvite.findOne({
            clanId: inviter.clanId,
            inviteeId: invitee._id,
            status: 'pending'
        });

        if (existingInvite) {
            return res.status(400).json({ message: 'Invite already pending.' });
        }

        const invite = new ClanInvite({
            clanId: inviter.clanId,
            inviterId,
            inviteeId: invitee._id
        });

        await invite.save();

        res.status(200).json({ status: 'success', message: 'Invite sent.' });
    } catch (err) {
        res.status(500).json({ message: 'Error sending invite.' });
    }
};

exports.acceptInvite = async (req, res) => {
    try {
        const inviteId = req.params.id;
        const userId = req.user.id;

        const invite = await ClanInvite.findById(inviteId);
        if (!invite || invite.inviteeId.toString() !== userId.toString() || invite.status !== 'pending') {
            return res.status(400).json({ message: 'Invalid or expired invite.' });
        }

        const clan = await Clan.findById(invite.clanId);
        if (!clan) {
            return res.status(404).json({ message: 'Clan no longer exists.' });
        }

        if (clan.members.length >= MAX_MEMBERS) {
            return res.status(400).json({ message: `Induction failed. This division has reached its maximum capacity of ${MAX_MEMBERS} survivors.` });
        }

        if (clan.blacklist && clan.blacklist.includes(userId)) {
            return res.status(403).json({ message: 'Your signature is blacklisted from this division. Access denied.' });
        }

        clan.members.push(userId);
        await clan.save();

        await User.findByIdAndUpdate(userId, {
            clanId: clan._id,
            clanRole: 'member'
        });

        await del(`user:session:${userId}`).catch(() => { });
        await del('clan:leaderboard').catch(() => { });

        invite.status = 'accepted';
        await invite.save();

        await ClanInvite.updateMany(
            { inviteeId: userId, status: 'pending' },
            { status: 'declined' }
        );

        res.status(200).json({ status: 'success', message: 'Joined clan successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Error accepting invite.' });
    }
};

exports.kickMember = async (req, res) => {
    try {
        const { memberId } = req.body;
        const leaderId = req.user.id;

        if (memberId === leaderId) {
            return res.status(400).json({ message: 'Leaders cannot banish themselves.' });
        }

        const clan = await Clan.findOne({ leader: leaderId });
        if (!clan) {
            return res.status(403).json({ message: 'Unauthorized. Command access denied.' });
        }

        if (!clan.members.some(m => m.toString() === memberId.toString())) {
            return res.status(400).json({ message: 'The target unit is not resident in your division.' });
        }

        clan.members = clan.members.filter(m => m.toString() !== memberId.toString());

        if (!clan.blacklist.includes(memberId)) {
            clan.blacklist.push(memberId);
        }

        await clan.save();

        await User.findByIdAndUpdate(memberId, {
            clanId: null,
            clanRole: null
        });

        await new ClanLog({
            clanId: clan._id,
            action: 'KICK',
            operatorId: leaderId,
            targetId: memberId,
            details: 'Unit banished from division and blacklisted.'
        }).save();

        await del('clan:leaderboard').catch(() => { });

        res.status(200).json({ status: 'success', message: 'Survivor banished successfully.' });
    } catch (err) {
        res.status(500).json({ message: 'Error executing banishment.' });
    }
};

exports.leaveClan = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        if (!user.clanId) {
            return res.status(400).json({ message: 'You are not currenty registered in a tactical division.' });
        }

        if (user.clanRole === 'leader') {
            return res.status(400).json({ message: 'Division Commanders cannot desert. Transfer command first.' });
        }

        const clanId = user.clanId;
        const clan = await Clan.findById(clanId);
        if (clan) {
            if (!clan.members.some(m => m.toString() === userId.toString())) {
                user.clanId = null;
                user.clanRole = null;
                await user.save();
                return res.status(200).json({ status: 'success', message: 'Registry desynchronized.' });
            }

            clan.members = clan.members.filter(m => m.toString() !== userId.toString());
            await clan.save();

            await new ClanLog({
                clanId: clan._id,
                action: 'LEAVE',
                operatorId: userId,
                details: 'Unit has deserted the division.'
            }).save();
        }

        user.clanId = null;
        user.clanRole = null;
        await user.save();

        await del(`user:session:${userId}`).catch(() => { });
        await del('clan:leaderboard').catch(() => { });

        res.status(200).json({ status: 'success', message: 'Divisional registry liquidated. You are now a rogue unit.' });
    } catch (err) {
        res.status(500).json({ message: 'Error executing desertion protocol.' });
    }
};

exports.transferLeadership = async (req, res) => {
    try {
        const { newLeaderId } = req.body;
        const currentLeaderId = req.user.id;

        const clan = await Clan.findOne({ leader: currentLeaderId });
        if (!clan) {
            return res.status(403).json({ message: 'Unauthorized. Only the current Division Commander can initiate a handover.' });
        }

        const isTargetMember = clan.members.some(m => m.toString() === newLeaderId);
        if (!isTargetMember) {
            return res.status(400).json({ message: 'The target survivor is not a member of your division.' });
        }

        clan.leader = newLeaderId;
        await clan.save();

        await User.findByIdAndUpdate(currentLeaderId, { clanRole: 'member' });

        await User.findByIdAndUpdate(newLeaderId, { clanRole: 'leader' });

        await new ClanLog({
            clanId: clan._id,
            action: 'TRANSFER',
            operatorId: currentLeaderId,
            targetId: newLeaderId,
            details: 'Total command of the division has been transferred.'
        }).save();

        await del(`user:session:${currentLeaderId}`).catch(() => { });
        await del(`user:session:${newLeaderId}`).catch(() => { });
        await del('clan:leaderboard').catch(() => { });

        res.status(200).json({ status: 'success', message: 'Command handover complete. You are now a standard Tactical Unit member.' });
    } catch (err) {
        res.status(500).json({ message: 'Error executing command handover protocol.' });
    }
};

const ClanMessage = require('../models/ClanMessage');

exports.getClanMessages = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const user = await User.findById(userId);

        const userClanId = user.clanId?.toString();
        const targetClanId = id.toString();

        if (userClanId !== targetClanId) {
            console.error(`[Comms Auth Failure] User: ${userId}, UserClan: ${userClanId}, TargetClan: ${targetClanId}`);
            return res.status(403).json({
                message: 'Unauthorized. You are not a member of this division.',
                details: process.env.NODE_ENV === 'development' ? { userClanId, targetClanId } : undefined
            });
        }

        const messages = await ClanMessage.find({ clanId: id })
            .sort({ timestamp: -1 })
            .limit(50)
            .populate('senderId', 'nickname')
            .lean();

        res.status(200).json({ status: 'success', data: messages.reverse() });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching tactical transmissions.' });
    }
};

exports.getMyInvites = async (req, res) => {
    try {
        const userId = req.user.id;
        const invites = await ClanInvite.find({
            inviteeId: userId,
            status: 'pending'
        })
            .populate('clanId', 'name tag slug')
            .populate('inviterId', 'username');

        res.status(200).json({ status: 'success', data: invites });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching invites.' });
    }
};

exports.getClanIntel = async (req, res) => {
    try {
        const { id } = req.params;
        const clan = await Clan.findById(id);

        if (!clan) {
            return res.status(404).json({ message: 'Division not found.' });
        }

        const DuelProfile = require('../models/DuelProfile');
        const User = require('../models/User');
        const [profiles, higherClans] = await Promise.all([
            DuelProfile.find({ user: { $in: clan.members } }),
            Clan.countDocuments({ weeklyPoints: { $gt: clan.weeklyPoints } })
        ]);

        const totalElo = profiles.reduce((sum, p) => sum + (p.survivalElo || 1000), 0);
        const totalSolved = profiles.reduce((sum, p) => sum + (p.totalSolved || 0), 0);
        const avgElo = Math.round(totalElo / Math.max(clan.members.length, 1));

        const globalRank = higherClans + 1;

        const topCombatants = profiles
            .sort((a, b) => (b.survivalElo || 0) - (a.survivalElo || 0))
            .slice(0, 3);

        const topCombatantsIds = topCombatants.map(p => p.user);
        const topCombatantsPopulated = await User.find({ _id: { $in: topCombatantsIds } })
            .select('username nickname');

        const combatantsData = topCombatants.map(p => {
            const user = topCombatantsPopulated.find(u => u._id.toString() === p.user.toString());
            return {
                name: user?.nickname || user?.username,
                elo: p.survivalElo || 1000,
                rank: p.survivalRank || 'Recruit'
            };
        });

        res.status(200).json({
            status: 'success',
            data: {
                metrics: {
                    avgElo,
                    totalSolved,
                    globalRank,
                    capacity: `${clan.members.length} / 50`
                },
                topCombatants: combatantsData,
                weeklyPower: clan.weeklyPoints
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error synthesizing divisional intel.' });
    }
};


exports.requestToJoin = async (req, res) => {
    try {
        const userId = req.user.id;
        const { clanId } = req.body;

        const user = await User.findById(userId);
        if (user.clanId) {
            return res.status(400).json({ message: 'You are already part of a division.' });
        }

        const clan = await Clan.findById(clanId);
        if (!clan) {
            return res.status(404).json({ message: 'Target division not found.' });
        }

        if (clan.members.length >= MAX_MEMBERS) {
            return res.status(400).json({ message: 'Division is at maximum capacity.' });
        }

        if (clan.blacklist && clan.blacklist.includes(userId)) {
            return res.status(403).json({ message: 'Your signature is blacklisted from this division.' });
        }

        const existingRequest = await ClanJoinRequest.findOne({
            clanId,
            userId,
            status: 'pending'
        });

        if (existingRequest) {
            return res.status(400).json({ message: 'Induction request already pending for this sector.' });
        }

        const joinRequest = new ClanJoinRequest({
            clanId,
            userId,
            message: req.body.message || ''
        });

        await joinRequest.save();

        if (global.io) {
            global.io.to(`clan:${clanId}`).emit('clan:newJoinRequest', {
                requestId: joinRequest._id,
                userName: user.nickname || user.username
            });
        }

        res.status(200).json({ status: 'success', message: 'Induction request transmitted to command.' });
    } catch (err) {
        res.status(500).json({ message: 'Error formalizing induction request.' });
    }
};

exports.updateClanDescription = async (req, res) => {
    try {
        const { description } = req.body;
        const leaderId = req.user.id;

        const clan = await Clan.findOne({ leader: leaderId });
        if (!clan) {
            return res.status(403).json({ message: 'Only Division Commanders can refine the strategic directive.' });
        }

        clan.description = description;
        await clan.save();

        res.status(200).json({ status: 'success', message: 'Divisional directive updated successfully.', data: { description } });
    } catch (err) {
        res.status(500).json({ message: 'Error refining tactical directive.' });
    }
};

exports.getJoinRequests = async (req, res) => {
    try {
        const leaderId = req.user.id;
        const clan = await Clan.findOne({ leader: leaderId });

        if (!clan) {
            return res.status(403).json({ message: 'Only Division Commanders can monitor induction requests.' });
        }

        const requests = await ClanJoinRequest.find({
            clanId: clan._id,
            status: 'pending'
        })
            .populate('userId', 'nickname')
            .sort({ timestamp: -1 });

        res.status(200).json({ status: 'success', data: requests });
    } catch (err) {
        res.status(500).json({ message: 'Error retrieving pending induction list.' });
    }
};

exports.handleJoinRequest = async (req, res) => {
    try {
        const { requestId, action } = req.body;
        const leaderId = req.user.id;

        const joinRequest = await ClanJoinRequest.findById(requestId).populate('userId');
        if (!joinRequest || joinRequest.status !== 'pending') {
            return res.status(400).json({ message: 'Invalid or expired induction request.' });
        }

        const clan = await Clan.findOne({ leader: leaderId, _id: joinRequest.clanId });
        if (!clan) {
            return res.status(403).json({ message: 'Unauthorized. Command access denied.' });
        }

        if (action === 'reject') {
            joinRequest.status = 'declined';
            await joinRequest.save();
            return res.status(200).json({ status: 'success', message: 'Induction request rejected.' });
        }

        if (clan.members.length >= MAX_MEMBERS) {
            return res.status(400).json({ message: 'Sector full. Cannot induct more units.' });
        }

        if (joinRequest.userId.clanId) {
            joinRequest.status = 'declined';
            await joinRequest.save();
            return res.status(400).json({ message: 'Survivor is already part of another division.' });
        }

        clan.members.push(joinRequest.userId._id);
        await clan.save();

        await User.findByIdAndUpdate(joinRequest.userId._id, {
            clanId: clan._id,
            clanRole: 'member'
        });

        const { del } = require('../services/redis');
        await del(`user:session:${joinRequest.userId._id}`).catch(() => { });

        joinRequest.status = 'approved';
        await joinRequest.save();

        await ClanJoinRequest.updateMany(
            { userId: joinRequest.userId._id, status: 'pending' },
            { status: 'declined' }
        );

        await ClanInvite.updateMany(
            { inviteeId: joinRequest.userId._id, status: 'pending' },
            { status: 'declined' }
        );


        await new ClanLog({
            clanId: clan._id,
            action: 'JOIN',
            operatorId: leaderId,
            targetId: joinRequest.userId._id,
            details: 'Unit successfully inducted via petition.'
        }).save();

        await del('clan:leaderboard').catch(() => { });

        res.status(200).json({ status: 'success', message: 'Unit successfully inducted into division.' });
    } catch (err) {
        res.status(500).json({ message: 'Error executing induction protocol.' });
    }
};

exports.getClanLogs = async (req, res) => {
    try {
        const userId = req.user.id;
        const clan = await Clan.findOne({ leader: userId });

        if (!clan) {
            return res.status(403).json({ message: 'Unauthorized. Command intel access only.' });
        }

        const logs = await ClanLog.find({ clanId: clan._id })
            .sort({ createdAt: -1 })
            .limit(50)
            .populate('operatorId', 'nickname')
            .populate('targetId', 'nickname');

        res.status(200).json({ status: 'success', data: logs });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching command history logs.' });
    }
};
