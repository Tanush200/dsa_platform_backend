const mongoose = require('mongoose');

const SurvivalQuestionSchema = new mongoose.Schema({
    questionText: { type: String, required: true, index: true },
    codeSnippet: { type: String, default: "" },
    options: [{ type: String, required: true }],
    correctAnswer: { type: Number, required: true },
    type: {
        type: String,
        enum: ['output_prediction', 'dry_run', 'complexity', 'pattern_recognition', 'data_structure', 'bug_detection', 'conceptual'],
        required: true
    },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Easy', index: true },
    points: { type: Number, default: 10 },
    active: { type: Boolean, default: true, index: true }
}, { timestamps: true });

SurvivalQuestionSchema.index({ difficulty: 1, active: 1 });

module.exports = mongoose.model('SurvivalQuestion', SurvivalQuestionSchema);
