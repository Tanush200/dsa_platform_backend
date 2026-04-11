const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { evaluateFriendlyAnswer } = require('../sockets/friendlySocket');
const { getJson } = require('../services/redis');
const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});


const worker = new Worker('friendlyDuelQueue', async (job) => {
    const { roomId, userId, qIndex } = job.data;

    if (job.name === 'friendlyQuestionTimeout') {
        const room = await getJson(`friendly:duel:${roomId}`);

        if (room && room.players[userId]?.qIndex === qIndex) {
            console.log(`[Friendly] Timeout for user ${userId} in room ${roomId}`);
            await evaluateFriendlyAnswer(roomId, userId, undefined, global.io);
        }
    }
}, { connection });

worker.on('error', (err) => {
    console.error('Worker error:', err);
});

worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
});

module.exports = worker;
