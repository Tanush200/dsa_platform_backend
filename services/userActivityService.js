const User = require('../models/User');
const Clan = require('../models/Clan');
const { del } = require('./redis');

/**
 * Records a solve for a user, updating solve history and streaks based on Asia/Kolkata (IST).
 * @param {string} userId
 * @param {number} count
 * @param {number} points 
 */
async function recordSolve(userId, count = 1, points = 0) {
    try {
        const user = await User.findById(userId);
        if (!user) return null;

        if (user.clanId && points > 0) {
            const Clan = require('../models/Clan');
            const clan = await Clan.findById(user.clanId);

            if (clan) {
                clan.weeklyPoints += points;
                clan.totalPoints += points;

                const newLevel = points >= 60000 ? Math.floor(5 + (clan.totalPoints - 60000) / 50000) :
                    clan.totalPoints >= 30000 ? 4 :
                        clan.totalPoints >= 15000 ? 3 :
                            clan.totalPoints >= 5000 ? 2 : 1;

                if (newLevel > (clan.level || 1)) {
                    clan.level = newLevel;
                }

                await clan.save().catch(e => console.error("Error saving divisional growth:", e));
                await del('clan:leaderboard').catch(() => { });

                if (global.io) {
                    global.io.to(`clan:${user.clanId}`).emit('clan:unitSuccess', {
                        userId: user._id,
                        userName: user.nickname || user.username,
                        points,
                        timestamp: new Date()
                    });
                }
            }
        }

        if (!user.solveHistory) user.solveHistory = [];

        const istNow = new Date();
        const istTodayStr = istNow.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        if (user.lastSolvedDate) {
            const lastSolved = new Date(user.lastSolvedDate);
            const lastSolvedStr = lastSolved.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

            if (istTodayStr === lastSolvedStr) {

            } else {

                const yesterday = new Date(istNow);
                yesterday.setDate(yesterday.getDate() - 1);
                const istYesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

                if (lastSolvedStr === istYesterdayStr) {
                    user.currentStreak = (user.currentStreak || 0) + 1;
                } else {
                    user.currentStreak = 1;
                }
                user.lastSolvedDate = istNow;
            }
        } else {
            user.currentStreak = 1;
            user.lastSolvedDate = istNow;
        }

        if (user.currentStreak > (user.maxStreak || 0)) {
            user.maxStreak = user.currentStreak;
        }

        const existingDay = user.solveHistory.find(d => d.date === istTodayStr);
        if (existingDay) {
            existingDay.count += count;
        } else {
            user.solveHistory.push({ date: istTodayStr, count: count });
        }

        if (user.solveHistory.length > 500) {
            user.solveHistory = user.solveHistory.slice(-500);
        }

        user.markModified('solveHistory');
        await user.save();


        if (user.firebaseUid) {
            await del(`user:session:${user.firebaseUid}`).catch(() => { });
        } else {
            await del(`user:session:${user.email}`).catch(() => { });
        }

        return user;
    } catch (err) {
        console.error("Error in recordSolve service:", err);
        return null;
    }
}

module.exports = {
    recordSolve
};
