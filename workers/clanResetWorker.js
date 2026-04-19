const { Worker, Queue } = require('bullmq');
const Redis = require('ioredis');
const Clan = require('../models/Clan');
const mongoose = require('mongoose');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});

async function resetWeeklyPoints() {
    console.log('[Clan Reset Worker] Initiating Weekly Morale Reset...');
    try {
        const result = await Clan.updateMany({}, { $set: { weeklyPoints: 0 } });
        console.log(`[Clan Reset Worker] Reset complete. ${result.modifiedCount} divisions synchronized.`);
    } catch (err) {
        console.error('[Clan Reset Worker] Reset failed:', err);
    }
}

const worker = new Worker('clanResetQueue', async (job) => {
    if (job.name === 'weeklyReset') {
        await resetWeeklyPoints();
    }
}, { connection });

const scheduleReset = async () => {
    const queue = new Queue('clanResetQueue', { connection });

    const repeatableJobs = await queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await queue.removeRepeatableByKey(job.key);
    }


    await queue.add('weeklyReset', {}, {
        repeat: {
            pattern: '0 0 * * 1'
        }
    });
    console.log('[Clan Reset Worker] Weekly reset scheduled for Monday 00:00');
};

scheduleReset().catch(console.error);

module.exports = worker;
