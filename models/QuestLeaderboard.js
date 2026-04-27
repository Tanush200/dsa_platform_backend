const mongoose = require('mongoose');

const QuestLeaderboardSchema = new mongoose.Schema({
    questId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DailyQuest',
        required: true,
        unique: true
    },
    rankings: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String,
        score: Number,
        timeTaken: Number,
        rank: Number
    }],
    calculatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('QuestLeaderboard', QuestLeaderboardSchema);
