const mongoose = require('mongoose');

const QuestSubmissionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    questId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DailyQuest',
        required: true
    },
    answers: [{
        questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SurvivalQuestion' },
        selectedOption: { type: Number },
        timeTaken: { type: Number },
        isCorrect: { type: Boolean, default: false }
    }],
    totalScore: { type: Number, default: 0 },
    totalTimeTaken: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now },
    isProcessed: { type: Boolean, default: false }
}, { timestamps: true });

QuestSubmissionSchema.index({ questId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('QuestSubmission', QuestSubmissionSchema);
