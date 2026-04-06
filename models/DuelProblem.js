const mongoose = require('mongoose');

const TestCaseSchema = new mongoose.Schema({
    input: {
        type: String,
        required: true
    },
    expectedOutput: {
        type: String,
        required: true
    },
    isHidden: {
        type: Boolean,
        default: false
    }
});

const DuelProblemSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    difficulty: {
        type: String,
        enum: ['Easy', 'Medium', 'Hard'],
        default: 'Medium',
        index: true
    },

    tags: [String],
    supportedModes: [{
        type: String,
        enum: ['speed', 'optimization', 'bugfix', 'reverse']
    }],

    buggyCode: {
        cpp: { type: String },
        java: { type: String },
        javascript: { type: String },
        python: { type: String }
    },
    starterCode: {
        cpp: String, java: String, python: String, javascript: String
    },
    wrapperCode: {
        cpp: String, java: String, python: String, javascript: String
    },

    reverseOutput: {
        type: String
    },
    testCases: [TestCaseSchema],
    active: { type: Boolean, default: true, index: true }
}, { timestamps: true });

module.exports = mongoose.model('DuelProblem', DuelProblemSchema);
