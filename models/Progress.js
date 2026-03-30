const mongoose = require('mongoose');

const ProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  problemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem',
    required: true
  },
  status: {
    type: String,
    enum: ['Todo', 'Solved', 'Review'],
    default: 'Todo'
  },
  notes: {
    type: String
  },
  difficultyRating: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard', 'None', ''],
    default: ''
  },
  nextReviewDate: {
    type: Date
  }
}, { timestamps: true });

ProgressSchema.index({ userId: 1, problemId: 1 }, { unique: true });

module.exports = mongoose.model('Progress', ProgressSchema);
