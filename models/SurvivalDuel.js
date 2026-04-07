const mongoose = require('mongoose');

const SurvivalDuelSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    players: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        points: { type: Number, default: 0 },
        streak: { type: Number, default: 0 },
        eliminated: { type: Boolean, default: false }
    }],
    status: { type: String, enum: ['waiting', 'active', 'finished'], default: 'waiting' },
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    startedAt: { type: Date },
    finishedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('SurvivalDuel', SurvivalDuelSchema);
