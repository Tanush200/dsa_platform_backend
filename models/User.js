const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  firebaseUid: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  email: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String,
    default: null
  },
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  },
  password: {
    type: String,
    required: false // No longer required for Firebase users
  },
  nickname: {
    type: String,
    default: "",
    index: true
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
