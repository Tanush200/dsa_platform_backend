const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  nickname: {
    type: String,
    default: ""
  },
  role: {
    type: String,
    enum: ['student', 'admin'],
    default: 'student'
  },
  startDate: {
    type: Date
  },
  targetDurationDays: {
    type: Number
  },
  currentStreak: {
    type: Number,
    default: 0
  },
  maxStreak: {
    type: Number,
    default: 0
  },
  lastSolvedDate: {
    type: Date,
    default: null
  },
  solveHistory: [{
    date: { type: String },
    count: { type: Number, default: 0 }
  }]
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
