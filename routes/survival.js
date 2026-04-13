const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');
const verifyGate = require('../middleware/verifyGate');
const SurvivalQuestion = require('../models/SurvivalQuestion');
const SurvivalDuel = require('../models/SurvivalDuel');
const DuelProfile = require('../models/DuelProfile');
const { setCache, noCache } = require('../middleware/cache');


router.get('/questions', [auth, verifyGate, setCache(600)], async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const query = req.user.role === 'admin' ? {} : { active: true };

        const total = await SurvivalQuestion.countDocuments(query);
        const questions = await SurvivalQuestion.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            questions,
            total,
            hasMore: total > skip + questions.length
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
    }
});



router.post('/questions', [auth, verifyGate, admin], async (req, res) => {
    try {
        const question = new SurvivalQuestion(req.body);
        await question.save();
        res.status(201).json(question);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
    }
});


router.patch('/questions/:id/toggle', [auth, verifyGate, admin], async (req, res) => {
    try {
        const question = await SurvivalQuestion.findById(req.params.id);
        if (!question) return res.status(404).json({ message: 'Question not found' });
        question.active = !question.active;
        await question.save();
        res.json({ message: `Question ${question.active ? 'activated' : 'deactivated'}`, question });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
    }
});


router.get('/history', [auth, verifyGate, noCache], async (req, res) => {
    try {
        const duels = await SurvivalDuel.find({ 'players.user': req.user.id, status: 'finished' })
            .sort({ finishedAt: -1 })
            .limit(20)
            .populate('players.user', 'username')
            .populate('winner', 'username')
            .lean();
        res.json(duels);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
    }
});


router.get('/duel/:id', auth, verifyGate, async (req, res) => {
    try {
        const duel = await SurvivalDuel.findById(req.params.id)
            .populate('players.user', 'username')
            .populate('winner', 'username');
        if (!duel) return res.status(404).json({ message: 'Duel not found' });
        res.json(duel);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
    }
});


router.get('/leaderboard', [auth, setCache(300)], async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const domain = req.query.domain || 'cs';

        let total, topRaw;

        if (domain === 'cs') {
            total = await DuelProfile.countDocuments({ survivalTotalDuels: { $gt: 0 } });
            topRaw = await DuelProfile.find({ survivalTotalDuels: { $gt: 0 } })
                .sort({ survivalElo: -1 })
                .skip(skip)
                .limit(limit)
                .populate('user', 'nickname username')
                .lean();
        } else {
            const queryPath = `domainStats.${domain}.totalDuels`;
            const sortPath = `domainStats.${domain}.elo`;
            
            total = await DuelProfile.countDocuments({ [queryPath]: { $gt: 0 } });
            topRaw = await DuelProfile.find({ [queryPath]: { $gt: 0 } })
                .sort({ [sortPath]: -1 })
                .skip(skip)
                .limit(limit)
                .populate('user', 'nickname username')
                .lean();
        }

        // Normalize response so the frontend doesn't break
        const top = topRaw.map(profile => {
            if (domain === 'cs') return profile;
            
            const stats = profile.domainStats?.[domain] || { elo: 1000, rank: 'Recruit', wins: 0, losses: 0, totalDuels: 0 };
            return {
                ...profile,
                survivalElo: stats.elo,
                survivalRank: stats.rank,
                survivalWins: stats.wins,
                survivalLosses: stats.losses,
                survivalTotalDuels: stats.totalDuels
            };
        });

        res.json({
            leaderboard: top,
            total,
            hasMore: total > skip + top.length
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
    }
});


router.get('/my-profile', [auth, verifyGate, noCache], async (req, res) => {
    try {
        const domain = req.query.domain || 'cs';
        let profile = await DuelProfile.findOne({ user: req.user.id })
            .select('-survivalSeenQuestions')
            .lean();
            
        if (!profile) return res.json({ survivalElo: 1000, survivalRank: 'Recruit', survivalWins: 0, survivalLosses: 0, survivalBestStreak: 0, survivalTotalDuels: 0 });

        // Normalize data to requested domain so frontend logic remains intact
        if (domain !== 'cs') {
            const stats = profile.domainStats?.[domain] || { elo: 1000, rank: 'Recruit', wins: 0, losses: 0, totalDuels: 0, bestStreak: 0 };
            profile = {
                ...profile,
                survivalElo: stats.elo,
                survivalRank: stats.rank,
                survivalWins: stats.wins,
                survivalLosses: stats.losses,
                survivalTotalDuels: stats.totalDuels,
                survivalBestStreak: stats.bestStreak
            };
        }

        res.json(profile);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
