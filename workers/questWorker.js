const { Worker, Queue } = require('bullmq');
const Redis = require('ioredis');
const DailyQuest = require('../models/DailyQuest');
const QuestSubmission = require('../models/QuestSubmission');
const QuestLeaderboard = require('../models/QuestLeaderboard');
const SurvivalQuestion = require('../models/SurvivalQuestion');
const mongoose = require('mongoose');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});

async function processEndedQuests() {
    console.log('[Quest Worker] Checking for ended quests to calculate leaderboards...');
    try {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

        const endedQuests = await DailyQuest.find({
            endTime: { $lte: thirtyMinutesAgo },
            status: { $ne: 'Completed' }
        });

        for (const quest of endedQuests) {
            console.log(`[Quest Worker] Processing leaderboard for Quest: ${quest.title} (${quest._id})`);

            const submissions = await QuestSubmission.find({ questId: quest._id })
                .populate('userId', 'username');

            if (submissions.length === 0) {
                console.log(`[Quest Worker] No submissions for quest ${quest._id}. Marking as completed.`);
                quest.status = 'Completed';
                await quest.save();
                continue;
            }

            const questions = await SurvivalQuestion.find({ _id: { $in: quest.questions } });
            const answerKey = {};
            questions.forEach(q => {
                answerKey[q._id.toString()] = q.correctAnswer;
            });

            const processedSubmissions = submissions.map(sub => {
                let score = 0;
                const evaluatedAnswers = sub.answers.map(ans => {
                    const isCorrect = answerKey[ans.questionId.toString()] === ans.selectedOption;
                    if (isCorrect) score += quest.pointsPerCorrect;
                    else if (ans.selectedOption !== undefined) score += quest.pointsPerWrong;

                    return { ...ans.toObject(), isCorrect };
                });

                return {
                    userId: sub.userId._id,
                    username: sub.userId.username,
                    score,
                    timeTaken: sub.totalTimeTaken,
                    submissionId: sub._id,
                    evaluatedAnswers
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
                    isProcessed: true,
                    answers: s.evaluatedAnswers
                });
            }

            await QuestLeaderboard.findOneAndUpdate(
                { questId: quest._id },
                {
                    rankings,
                    calculatedAt: new Date()
                },
                { upsert: true, new: true }
            );

            quest.status = 'Completed';
            await quest.save();

            console.log(`[Quest Worker] Completed leaderboard for Quest: ${quest.title}`);
        }
    } catch (err) {
        console.error('[Quest Worker] Error processing quests:', err);
    }
}

const worker = new Worker('questQueue', async (job) => {
    if (job.name === 'hourlyCheck') {
        await processEndedQuests();
    }
}, { connection });

const scheduleQuestCheck = async () => {
    const queue = new Queue('questQueue', { connection });

    const repeatableJobs = await queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        if (job.name === 'hourlyCheck') {
            await queue.removeRepeatableByKey(job.key);
        }
    }

    await queue.add('hourlyCheck', {}, {
        repeat: {
            pattern: '*/10 * * * *'
        }
    });

    console.log('[Quest Worker] Periodic quest check scheduled every 10 minutes');
};

scheduleQuestCheck().catch(console.error);

module.exports = worker;
