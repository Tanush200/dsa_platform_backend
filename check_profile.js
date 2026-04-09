const mongoose = require('mongoose');
require('dotenv').config();
const DuelProfile = require('./models/DuelProfile');

async function check() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dsa_platform');
    const profiles = await DuelProfile.find({}).sort({ updatedAt: -1 }).limit(1).lean();
    if (profiles.length) {
        const p = profiles[0];
        console.log('--- PROFILE DATA ---');
        console.log('User:', p.user);
        console.log('Daily Streak:', p.dailyStreak);
        console.log('Last Streak At:', p.lastDailyStreakAt);
        console.log('Activity History:', p.survivalActivityHistory);
        console.log('IST Formatted:', p.lastDailyStreakAt ? p.lastDailyStreakAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : 'NONE');
    } else {
        console.log('No profiles found.');
    }
    process.exit(0);
}
check();
