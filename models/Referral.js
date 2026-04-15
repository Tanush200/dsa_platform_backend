const mongoose = require('mongoose');

const ReferralSchema = new mongoose.Schema({
  referrer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  referred: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  eloAwarded: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

ReferralSchema.pre('save', function (next) {
  if (this.referrer.toString() === this.referred.toString()) {
    return next(new Error('Self-referral is not allowed.'));
  }
  next();
});

module.exports = mongoose.model('Referral', ReferralSchema);
