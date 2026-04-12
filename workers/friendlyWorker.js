const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { evaluateFriendlyAnswer } = require('../sockets/friendlySocket');
const { getJson } = require('../services/redis');
const Duel = require('../models/Duel');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});

const worker = new Worker('friendlyDuelQueue', async (job) => {
    const { roomId, userId, qIndex, winnerId, mode, shortId, players } = job.data;

    if (job.name === 'friendlyQuestionTimeout') {
        const room = await getJson(`friendly:duel:${roomId}`);
        if (room && room.players[userId]?.qIndex === qIndex) {
            console.log(`[Friendly] Timeout for user ${userId} in room ${roomId}`);
            await evaluateFriendlyAnswer(roomId, userId, undefined, global.io);
        }
    }
    else if (job.name === 'saveFriendlyMatchResult') {
        try {
            const pIds = Object.keys(players);
            const duel = new Duel({
                players: pIds,
                status: 'finished',
                winner: winnerId,
                mode: mode,
                isFriendly: true,
                finishedAt: new Date(),
                roomId: shortId
            });
            await duel.save();
            console.log(`[Friendly Worker] Duel saved: ${roomId}`);
        } catch (err) {
            console.error('[Friendly Worker] Save Error:', err.message);
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
