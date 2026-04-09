const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { evaluateAnswer, handleGlobalTimeOut } = require('../sockets/survivalSocket');
const { getJson } = require('../services/redis')


const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});

const worker = new Worker('survivalQueue', async (job) => {
    const { roomId, userId, qIndex } = job.data;

    if (job.name === 'questionTimeout') {
        const duel = await getJson(`survival:duel:${roomId}`);
        if (duel && duel.players[userId]?.qIndex === qIndex) {
            await evaluateAnswer(roomId, userId, undefined, global.io);
        }
    }
    else if (job.name === 'globalTimeout') {
        await handleGlobalTimeOut(roomId, global.io);
    }
}, { connection });

worker.on('error', (err) => console.error('BullMQ error:', err));

console.log('BullMQ Survival Worker started successfully');