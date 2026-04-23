const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

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
    required: false
  },
  nickname: {
    type: String,
    default: null,
    sparse: true,
    unique: true,
    index: true
  },
  bio: {
    type: String,
    default: "",
    maxlength: 200
  },
  githubHandle: {
    type: String,
    default: ""
  },
  linkedinHandle: {
    type: String,
    default: ""
  },
  portfolioUrl: {
    type: String,
    default: ""
  },
  languages: {
    type: [String],
    default: []
  },
  skills: {
    type: [String],
    default: []
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
  }],
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  referralCount: {
    type: Number,
    default: 0
  },
  clanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Clan',
    default: null,
    index: true
  },
  clanRole: {
    type: String,
    enum: ['leader', 'member', null],
    default: null
  },
  lastClanCreatedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

UserSchema.pre('save', async function () {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  if (!this.referralCode) {
    this.referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  }
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
