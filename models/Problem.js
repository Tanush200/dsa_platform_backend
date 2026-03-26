const mongoose = require('mongoose');

const ProblemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  topic: {
    type: String,
    required: true
  },
  pattern: {
    type: String
  },
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    required: true
  },
  leetcodeLink: {
    type: String
  }
}, { timestamps: true });

module.exports = mongoose.model('Problem', ProblemSchema);
