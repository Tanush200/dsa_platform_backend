const mongoose = require('mongoose');
const DailyQuest = require('./models/DailyQuest');
const QuestSubmission = require('./models/QuestSubmission');
const SurvivalQuestion = require('./models/SurvivalQuestion');
const QuestLeaderboard = require('./models/QuestLeaderboard');

async function debug() {
    await mongoose.connect('mongodb://localhost:27017/dsa_platform');
    console.log('Connected to DB');

    const now = new Date();
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const targetQuests = await DailyQuest.find({
        endTime: { $lte: thirtyMinutesAgo },
        status: { $ne: 'Completed' }
    });

    console.log(`Found ${targetQuests.length} quests needing processing.`);
    
    for (const q of targetQuests) {
        console.log(`Quest: ${q.title} | Status: ${q.status} | End: ${q.endTime}`);
        const subs = await QuestSubmission.find({ questId: q._id });
        console.log(`Submissions for this quest: ${subs.length}`);
    }

    process.exit(0);
}

debug();
