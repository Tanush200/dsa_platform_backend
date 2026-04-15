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

ReferralSchema.pre('save', async function () {
  if (this.referrer.toString() === this.referred.toString()) {
    throw new Error('Self-referral is not allowed.');
  }
});

module.exports = mongoose.model('Referral', ReferralSchema);
