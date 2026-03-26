const mongoose = require('mongoose');

const interviewQuestionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  stack: {
    type: String,
    required: true,
    trim: true,
    default: 'General'
  },
  question: {
    type: String,
    required: true,
    trim: true
  },
  answer: {
    type: String,
    required: true
  },
  language: {
    type: String,
    default: 'javascript'
  },
  codeSnippet: {
    type: String,
    default: ''
  }
}, { timestamps: true });

interviewQuestionSchema.index({ user: 1, stack: 1 });

module.exports = mongoose.model('InterviewQuestion', interviewQuestionSchema);
