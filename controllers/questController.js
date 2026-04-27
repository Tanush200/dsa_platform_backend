const DailyQuest = require('../models/DailyQuest');
const QuestSubmission = require('../models/QuestSubmission');
const QuestLeaderboard = require('../models/QuestLeaderboard');
const SurvivalQuestion = require('../models/SurvivalQuestion');
const mongoose = require('mongoose');

exports.getQuests = async (req, res) => {
    try {
        const quests = await DailyQuest.find({
            status: { $in: ['Scheduled', 'Live', 'Ended', 'Completed'] }
        }).sort({ startTime: -1 }).limit(10);

        res.status(200).json({ status: 'success', data: quests });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.getQuestById = async (req, res) => {
    try {
        const quest = await DailyQuest.findById(req.params.id)
            .populate('questions', '-correctAnswer -active -createdAt -updatedAt'); // Hide sensitive fields

        if (!quest) return res.status(404).json({ status: 'fail', message: 'Quest not found' });

        const submission = await QuestSubmission.findOne({ questId: quest._id, userId: req.user._id });

        res.status(200).json({
            status: 'success',
            data: {
                quest,
                hasSubmitted: !!submission
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.submitQuest = async (req, res) => {
    try {
        const { questId, answers } = req.body;
        const userId = req.user._id;

        const quest = await DailyQuest.findById(questId);
        if (!quest) return res.status(404).json({ status: 'fail', message: 'Quest not found' });

        const now = new Date();

        if (now < quest.startTime) {
            return res.status(400).json({ status: 'fail', message: 'Quest has not started yet' });
        }
        if (now > quest.endTime) {
            return res.status(400).json({ status: 'fail', message: 'Quest has already ended' });
        }

        const existingSubmission = await QuestSubmission.findOne({ questId, userId });
        if (existingSubmission) {
            return res.status(400).json({ status: 'fail', message: 'You have already submitted this quest' });
        }
        const totalTimeTaken = answers.reduce((acc, curr) => acc + (curr.timeTaken || 0), 0);

        try {
            const submission = await QuestSubmission.create({
                questId,
                userId,
                answers,
                totalTimeTaken,
                submittedAt: now
            });

            res.status(201).json({
                status: 'success',
                message: 'Quest submitted successfully. Results will be available in 30 minutes.',
                data: { submissionId: submission._id }
            });
        } catch (err) {
            if (err.code === 11000) {
                console.log('[Submit] Caught Duplicate Key race condition');
                return res.status(200).json({
                    status: 'success',
                    message: 'Quest already submitted.',
                    data: { alreadySubmitted: true }
                });
            }
            throw err;
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.getLeaderboard = async (req, res) => {
    try {
        const leaderboard = await QuestLeaderboard.findOne({ questId: req.params.id })
            .populate('rankings.userId', 'username profilePicture');

        if (!leaderboard) {
            return res.status(200).json({
                status: 'success',
                message: 'Leaderboard is still being calculated or quest is active.',
                data: null
            });
        }

        res.status(200).json({ status: 'success', data: leaderboard });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.createQuest = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ status: 'fail', message: 'Unauthorized' });

        const { title, domain, startTime, endTime, questions, durationMinutes } = req.body;

        const quest = await DailyQuest.create({
            title,
            domain,
            startTime,
            endTime,
            questions,
            durationMinutes
        });

        res.status(201).json({ status: 'success', data: quest });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.getUserQuestStats = async (req, res) => {
    try {
        const userId = req.user._id;

        const masteredCount = await QuestSubmission.countDocuments({ userId, isProcessed: true });

        const allSubs = await QuestSubmission.find({ userId, isProcessed: true });
        const totalLP = allSubs.reduce((acc, curr) => acc + (curr.totalScore || 0), 0);

        const globalRankData = await QuestSubmission.aggregate([
            { $match: { isProcessed: true } },
            { $group: { _id: '$userId', totalScore: { $sum: '$totalScore' } } },
            { $sort: { totalScore: -1 } }
        ]);

        const myRankIndex = globalRankData.findIndex(r => r._id.toString() === userId.toString());
        const myRank = myRankIndex !== -1 ? myRankIndex + 1 : '--';

        res.status(200).json({
            status: 'success',
            data: {
                rank: myRank,
                mastered: masteredCount,
                totalLP
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.deleteQuest = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ status: 'fail', message: 'Unauthorized' });

        const quest = await DailyQuest.findById(req.params.id);
        if (!quest) return res.status(404).json({ status: 'fail', message: 'Quest not found' });

        if (quest.status !== 'Scheduled') {
            return res.status(400).json({ status: 'fail', message: 'Only scheduled quests can be deleted' });
        }

        await DailyQuest.findByIdAndDelete(req.params.id);
        res.status(200).json({ status: 'success', message: 'Quest deleted successfully' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

exports.forceCalculateLeaderboard = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ status: 'fail', message: 'Unauthorized' });

        const quest = await DailyQuest.findById(req.params.id);
        if (!quest) return res.status(404).json({ status: 'fail', message: 'Quest not found' });

        if (quest.status === 'Completed') {
            return res.status(400).json({ status: 'fail', message: 'Leaderboard already calculated' });
        }

        await processQuest(quest);

        res.status(200).json({ status: 'success', message: 'Leaderboard calculated successfully' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};

async function processQuest(quest) {
    const QuestSubmission = require('../models/QuestSubmission');
    const SurvivalQuestion = require('../models/SurvivalQuestion');
    const QuestLeaderboard = require('../models/QuestLeaderboard');

    const submissions = await QuestSubmission.find({ questId: quest._id }).populate('userId', 'username');
    if (submissions.length === 0) return;

    const questions = await SurvivalQuestion.find({ _id: { $in: quest.questions } });
    const answerKey = {};
    questions.forEach(q => {
        const correctOpt = q.options.findIndex(opt => opt === q.correctAnswer);
        answerKey[q._id.toString()] = correctOpt;
    });

    const processedSubmissions = submissions.map(sub => {
        let score = 0;
        const subAnswers = sub.answers.map(ans => {
            const isCorrect = answerKey[ans.questionId.toString()] === ans.selectedOption;
            if (isCorrect) score += quest.pointsPerCorrect || 10;
            else if (ans.selectedOption !== undefined) score += quest.pointsPerWrong || -2;
            return { ...ans.toObject(), isCorrect };
        });

        return {
            submissionId: sub._id,
            userId: sub.userId._id,
            username: sub.userId.username,
            score,
            timeTaken: sub.totalTimeTaken,
            answers: subAnswers
        };
    });

    processedSubmissions.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.timeTaken - b.timeTaken;
    });

    const rankings = processedSubmissions.map((s, index) => {
        let cleanUsername = s.username;
        if (cleanUsername && cleanUsername.includes('@')) {
            cleanUsername = cleanUsername.split('@')[0];
        }
        return {
            userId: s.userId,
            username: cleanUsername,
            score: s.score,
            timeTaken: s.timeTaken,
            rank: index + 1
        };
    });

    for (const s of processedSubmissions) {
        await QuestSubmission.findByIdAndUpdate(s.submissionId, {
            totalScore: s.score,
            answers: s.answers,
            isProcessed: true
        });
    }

    await QuestLeaderboard.findOneAndUpdate(
        { questId: quest._id },
        { rankings, calculatedAt: new Date() },
        { upsert: true, new: true }
    );

    quest.status = 'Completed';
    await quest.save();
}
exports.getAdminSubmissions = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ status: 'fail', message: 'Unauthorized' });

        const submissions = await QuestSubmission.find({ questId: req.params.id })
            .populate('userId', 'username email')
            .sort({ totalScore: -1, totalTimeTaken: 1 });

        res.status(200).json({ status: 'success', data: submissions });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};
