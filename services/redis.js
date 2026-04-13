const Redis = require('ioredis');
const dotenv = require('dotenv');

dotenv.config();

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null
});

const logger = require('../utils/logger');

redis.on('connect', () => {
    logger.info('Redis connected');
});

redis.on('error', (err) => {
    logger.error(err, 'Redis error');
});


async function getJson(key) {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null
}

async function setJson(key, data, ttlSeconds = 1800) {
    await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
}

async function del(key) {
    await redis.del(key);
}

module.exports = { redis, getJson, setJson, del };
