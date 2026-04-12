const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');
const SurvivalQuestion = require('../models/SurvivalQuestion');
const SurvivalDuel = require('../models/SurvivalDuel');
const DuelProfile = require('../models/DuelProfile');


router.get('/questions', auth, async (req, res) => {
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



router.post('/questions', [auth, admin], async (req, res) => {
    try {
        const question = new SurvivalQuestion(req.body);
        await question.save();
        res.status(201).json(question);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
    }
});


router.patch('/questions/:id/toggle', [auth, admin], async (req, res) => {
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


router.get('/history', auth, async (req, res) => {
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


router.get('/duel/:id', auth, async (req, res) => {
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


router.get('/leaderboard', auth, async (req, res) => {
    try {
        const top = await DuelProfile.find({ survivalTotalDuels: { $gt: 0 } })
            .sort({ survivalElo: -1 })
            .limit(50)
            .populate('user', 'nickname') // Only send nickname, hide email
            .lean();
        res.json(top);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
    }
});


router.get('/my-profile', auth, async (req, res) => {
    try {
        let profile = await DuelProfile.findOne({ user: req.user.id })
            .select('-survivalSeenQuestions') // Exclude giant array to save bandwidth
            .lean();
        if (!profile) return res.json({ survivalElo: 1000, survivalRank: 'Recruit', survivalWins: 0, survivalLosses: 0, survivalBestStreak: 0, survivalTotalDuels: 0 });
        res.json(profile);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
