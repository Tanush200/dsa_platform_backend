const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');

const Duel = require('../models/Duel');
const DuelProblem = require('../models/DuelProblem');
const DuelProfile = require('../models/DuelProfile');
const { recordSolve } = require('../services/userActivityService');

const { v4: uuidv4 } = require('uuid');
const { runAllTestCases } = require('../services/judge0');

async function getOrCreateProfile(userId) {
    let profile = await DuelProfile.findOne({ user: userId });
    if (!profile) {
        profile = new DuelProfile({ user: userId });
        await profile.save();
    }
    return profile;
}

function calculateElo(winnerElo, loserElo, K = 32) {
    const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
    const expectedLoser = 1 / (1 + Math.pow(10, (winnerElo - loserElo) / 400));
    return {
        winner: Math.round(winnerElo + K * (1 - expectedWinner)),
        loser: Math.round(loserElo + K * (0 - expectedLoser))
    };
}



router.get('/leaderboard', async (req, res) => {
    try {
        const top = await DuelProfile.find()
            .sort({ elo: -1 })
            .limit(50)
            .populate('user', 'nickname');
        return res.json(top);
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Server error' });
    }
});



router.get('/profile/me', auth, async (req, res) => {
    try {
        const profile = await getOrCreateProfile(req.user.id);
        res.json(profile);
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Server error' });
    }
});

router.get('/profile/:userId', auth, async (req, res) => {
    try {
        const profile = await DuelProfile.findOne({ user: req.params.userId }).populate('user', 'username');
        if (!profile) return res.status(404).json({ message: 'Profile not found' });
        return res.json(profile);
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Server error' });
    }
});

router.get('/history', auth, async (req, res) => {
    try {
        const duels = await Duel.find({ players: req.user.id, status: 'finished' })
            .sort({ finishedAt: -1 })
            .limit(20)
            .populate('players', 'nickname') // Hide emails
            .populate('winner', 'nickname')
            .populate('problem', 'title difficulty')
            .lean();
        res.json(duels);
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Server error' });
    }
});



router.get('/problems/all', auth, async (req, res) => {
    try {
        const filter = req.user.role === 'admin' ? {} : { active: true };
        const problems = await DuelProblem.find(filter).sort({ createdAt: -1 });
        res.json(problems);
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Server error' });
    }
});


router.get('/problems/:problemId', auth, async (req, res) => {
    try {
        const problem = await DuelProblem.findById(req.params.problemId);
        if (!problem) return res.status(404).json({ message: 'Problem not found' });
        res.json(problem);
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Server error' });
    }
});


router.post('/problems', [auth, admin], async (req, res) => {
    try {
        const problem = new DuelProblem(req.body);
        await problem.save();
        res.status(201).json(problem);
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Server error' });
    }
});


router.put('/problems/:problemId', [auth, admin], async (req, res) => {
    try {
        const problem = await DuelProblem.findByIdAndUpdate(
            req.params.problemId,
            req.body,
            { new: true, runValidators: true }
        );
        if (!problem) return res.status(404).json({ message: 'Problem not found' });
        res.json(problem);
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Server error' });
    }
});


router.delete('/problems/:problemId', [auth, admin], async (req, res) => {
    try {
        const problem = await DuelProblem.findByIdAndDelete(req.params.problemId);
        if (!problem) return res.status(404).json({ message: 'Problem not found' });
        res.json({ message: 'Problem deleted' });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Server error' });
    }
});


router.patch('/problems/:problemId/toggle', [auth, admin], async (req, res) => {
    try {
        const problem = await DuelProblem.findById(req.params.problemId);
        if (!problem) return res.status(404).json({ message: 'Problem not found' });
        problem.active = !problem.active;
        await problem.save();
        res.json({ message: `Problem ${problem.active ? 'activated' : 'deactivated'}`, problem });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Server error' });
    }
});


router.post('/problems/:problemId/testcases', [auth, admin], async (req, res) => {
    try {
        const problem = await DuelProblem.findById(req.params.problemId);
        if (!problem) return res.status(404).json({ message: 'Problem not found' });
        const { input, expectedOutput, isHidden = false } = req.body;
        if (!input || !expectedOutput) {
            return res.status(400).json({ message: 'input and expectedOutput are required' });
        }
        problem.testCases.push({ input, expectedOutput, isHidden });
        await problem.save();
        res.status(201).json(problem);
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Server error' });
    }
});


router.delete('/problems/:problemId/testcases/:tcId', [auth, admin], async (req, res) => {
    try {
        const problem = await DuelProblem.findById(req.params.problemId);
        if (!problem) return res.status(404).json({ message: 'Problem not found' });
        const tcIndex = problem.testCases.findIndex(tc => tc._id.toString() === req.params.tcId);
        if (tcIndex === -1) return res.status(404).json({ message: 'Test case not found' });
        problem.testCases.splice(tcIndex, 1);
        await problem.save();
        res.json({ message: 'Test case deleted', problem });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Server error' });
    }
});



router.get('/:id', auth, async (req, res) => {
    try {
        const duel = await Duel.findById(req.params.id)
            .populate('players', 'username')
            .populate('winner', 'username')
            .populate('problem');
        if (!duel) return res.status(404).json({ message: 'Duel not found' });
        res.json(duel);
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Server error' });
    }
});


router.post('/:id/run', auth, async (req, res) => {
    try {
        const { code, language } = req.body;
        if (!code || !language) {
            return res.status(400).json({ message: 'code and language are required' });
        }
        const duel = await Duel.findById(req.params.id).populate('problem').lean();
        if (!duel) return res.status(404).json({ message: 'Duel not found' });
        if (duel.status !== 'active') return res.status(400).json({ message: 'Duel is not active' });

        const playerId = req.user.id;
        if (!duel.players.map(p => p.toString()).includes(playerId)) {
            return res.status(403).json({ message: 'You are not a player in this duel' });
        }

        let finalCodeToRun = code;
        if (duel.problem && duel.problem.wrapperCode && duel.problem.wrapperCode[language]) {
            finalCodeToRun = duel.problem.wrapperCode[language].replace('{{USER_CODE}}', code);
        } else if (!duel.problem && !duel.isFriendly) {
            return res.status(400).json({ message: 'Problem data missing for this duel' });
        }
        const judgeResult = await runAllTestCases({
            code: finalCodeToRun,
            language,
            testCases: duel.problem.testCases
        });

        res.json({
            passed: judgeResult.passed,
            passedCount: judgeResult.passedCount,
            totalCount: judgeResult.totalCount,
            avgTimeMs: judgeResult.avgTimeMs,
            results: judgeResult.results
        });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Server error' });
    }
});


router.post('/:id/submit', auth, async (req, res) => {
    try {
        const duel = await Duel.findById(req.params.id);
        if (!duel) return res.status(404).json({ message: 'Duel not found' });
        if (duel.status !== 'active') return res.status(400).json({ message: 'Duel is not active' });

        const playerId = req.user.id;
        if (!duel.players.map(p => p.toString()).includes(playerId)) {
            return res.status(403).json({ message: 'You are not a player in this duel' });
        }

        const existing = duel.submissions.find(s => s.user.toString() === playerId && s.passed);
        if (existing) return res.status(400).json({ message: 'You have already submitted' });

        const existingSub = duel.submissions.find(s => s.user.toString() === playerId);
        if (existingSub) {
            existingSub.attempts += 1;
            existingSub.passed = req.body.passed || false;
            existingSub.submittedAt = new Date();
            existingSub.timeMs = req.body.timeMs;
        } else {
            duel.submissions.push({
                user: playerId,
                submittedAt: new Date(),
                passed: req.body.passed || false,
                attempts: 1,
                timeMs: req.body.timeMs
            });
        }

        if (req.body.passed) {
            await recordSolve(playerId);
            if (duel.mode === 'optimization') {
                const bothPassed = duel.submissions.filter(s => s.passed).length === 2;
                if (bothPassed) {
                    const sorted = duel.submissions.filter(s => s.passed).sort((a, b) => a.timeMs - b.timeMs);
                    duel.winner = sorted[0].user;
                } else {
                    await duel.save();
                    return res.json({ message: 'Solution recorded, waiting for opponent', duel });
                }
            } else {
                duel.winner = playerId;
            }

            duel.status = 'finished';
            duel.finishedAt = new Date();

            const loserId = duel.players.find(p => p.toString() !== duel.winner.toString());
            // const winnerProfile = await getOrCreateProfile(duel.winner.toString());
            // const loserProfile = await getOrCreateProfile(loserId.toString());
            const [winnerProfile, loserProfile] = await Promise.all([
                getOrCreateProfile(duel.winner.toString()),
                getOrCreateProfile(loserId.toString())
            ])

            const { winner: newWinnerElo, loser: newLoserElo } = calculateElo(winnerProfile.elo, loserProfile.elo);
            const winnerDelta = newWinnerElo - winnerProfile.elo;
            const loserDelta = newLoserElo - loserProfile.elo;

            winnerProfile.elo = newWinnerElo;
            winnerProfile.wins += 1;
            winnerProfile.currentStreak += 1;
            winnerProfile.totalDuels += 1;
            winnerProfile.bestStreak = Math.max(winnerProfile.bestStreak, winnerProfile.currentStreak);
            winnerProfile.lastDuelAt = new Date();
            await winnerProfile.save();

            loserProfile.elo = Math.max(0, newLoserElo);
            loserProfile.losses += 1;
            loserProfile.currentStreak = 0;
            loserProfile.totalDuels += 1;
            loserProfile.lastDuelAt = new Date();
            await loserProfile.save();

            duel.eloChanges = [
                { user: duel.winner, delta: winnerDelta },
                { user: loserId, delta: loserDelta }
            ];
        }

        await duel.save();
        res.json({ message: 'Submission recorded', duel });

    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Server error' });
    }
});


module.exports = router;
