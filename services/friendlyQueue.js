const { Queue } = require('bullmq');

const Redis = require('ioredis');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});

const friendlyQueue = new Queue('friendlyDuelQueue', { connection });

async function addFriendlyQuestionTimer(roomId, userId, qIndex, delay) {
    await friendlyQueue.add('friendlyQuestionTimeout',
        { roomId, userId, qIndex },
        { delay, jobId: `friendly-q-${roomId}-${userId}-${qIndex}` }
    );

}

async function addFriendlyEndMatchJob(data) {
    await friendlyQueue.add('saveFriendlyMatchResult', data, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 }
    });
}

module.exports = { addFriendlyQuestionTimer, addFriendlyEndMatchJob, friendlyQueue };