const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});

const survivalQueue = new Queue('survivalQueue', { connection });

async function addQuestionTimer(roomId, userId, qIndex, delay) {
    await survivalQueue.add(
        'questionTimeout',
        { roomId, userId, qIndex },
        { delay, jobId: `q-${roomId}-${userId}-${qIndex}` }
    )
}

async function addGlobalTimer(roomId, delay) {
    await survivalQueue.add(
        'globalTimeout',
        { roomId },
        { delay, jobId: `global-${roomId}` }
    );
}

module.exports = { 
    addQuestionTimer, 
    addGlobalTimer, 
    survivalQueue 
};