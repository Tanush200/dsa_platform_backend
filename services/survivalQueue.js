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

async function addEndMatchJob(data) {
    await survivalQueue.add('saveMatchResult', data, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 }
    });
}

async function addBotTurn(roomId, botId, delay) {
    await survivalQueue.add(
        'botTurn',
        { roomId, userId: botId },
        { delay, jobId: `bot-${roomId}-${botId}-${Date.now()}` }
    );
}

async function addAbandonmentTimer(roomId, userId, delay) {
    await survivalQueue.add(
        'abandonmentTimeout',
        { roomId, userId },
        { delay, jobId: `abandon-${roomId}-${userId}` }
    );
}

module.exports = { 
    addQuestionTimer, 
    addGlobalTimer, 
    addEndMatchJob,
    addBotTurn,
    addAbandonmentTimer,
    survivalQueue 
};