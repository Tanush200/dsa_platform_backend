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

module.exports = { addFriendlyQuestionTimer, friendlyQueue };