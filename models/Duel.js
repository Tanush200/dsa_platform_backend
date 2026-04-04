const mongoose = require('mongoose');

const SubmissionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    submittedAt: {
        type: Date
    },
    passed: {
        type: Boolean,
        default: false
    },
    attempts: {
        type: Number,
        default: 0
    },
    timeMs: {
        type: Number
    }
});

const DuelSchema = new mongoose.Schema({
    players: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],

    problem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DuelProblem',
        required: true
    },

    mode: {
        type: String,
        enum: ['speed', 'optimization', 'bugfix', 'reverse'],
        default: 'speed'
    },

    status: {
        type: String,
        enum: ['waiting', 'active', 'finished', 'cancelled'],
        default: 'waiting'
    },

    startedAt: {
        type: Date
    },
    finishedAt: {
        type: Date
    },

    durationSeconds: {
        type: Number,
        default: 900
    },
    winner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    submissions: [SubmissionSchema],
    eloChanges: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        delta: {
            type: Number
        }
    }],
    roomId: {
        type: String,
        unique: true,
    }


}, { timestamps: true });

module.exports = mongoose.model('Duel', DuelSchema);