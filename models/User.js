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
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
