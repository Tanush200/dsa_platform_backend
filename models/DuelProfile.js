const mongoose = require('mongoose');

const DuelProfileSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    elo: {
        type: Number,
        default: 1000,
    },
    rank: {
        type: String,
        enum: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Grandmaster'],
        default: 'Bronze'
    },
    wins: {
        type: Number,
        default: 0
    },
    losses: {
        type: Number,
        default: 0
    },
    draws: {
        type: Number,
        default: 0
    },
    currentStreak: {
        type: Number,
        default: 0
    },
    bestStreak: {
        type: Number,
        default: 0,
    },
    totalDuels: {
        type: Number,
        default: 0
    },
    lastDuelAt: {
        type: Date,
        default: null
    }
}, { timestamps: true });

DuelProfileSchema.pre('save', async function () {
    const elo = this.elo;

    if (elo >= 2000) this.rank = 'Grandmaster';
    else if (elo >= 1800) this.rank = 'Master';
    else if (elo >= 1600) this.rank = 'Diamond';
    else if (elo >= 1400) this.rank = 'Platinum';
    else if (elo >= 1200) this.rank = 'Gold';
    else if (elo >= 1000) this.rank = 'Silver';
    else this.rank = 'Bronze';
});

module.exports = mongoose.model('DuelProfile', DuelProfileSchema);