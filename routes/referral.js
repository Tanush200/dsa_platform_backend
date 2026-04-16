const express = require('express');
const router = express.Router();
const { noCache } = require('../middleware/cache');
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const Referral = require('../models/Referral');
const referralService = require('../services/referralService');
const logger = require('../utils/logger');

router.use(noCache);

const ELO_REWARD = 50;

router.get('/my-code', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('referralCode referralCount createdAt referredBy');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json({
      referralCode: user.referralCode,
      referralCount: user.referralCount,
      createdAt: user.createdAt,
      alreadyReferred: !!user.referredBy
    });
  } catch (err) {
    logger.error(err, 'Failed to fetch referral code');
    res.status(500).json({ message: 'Failed to fetch referral code.' });
  }
});

router.get('/history', auth, async (req, res) => {
  try {
    const referrals = await Referral.find({ referrer: req.user.id })
      .populate('referred', 'username createdAt')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      totalReferred: referrals.length,
      totalEloEarned: referrals.filter(r => r.eloAwarded).length * ELO_REWARD,
      referrals: referrals.map(r => ({
        username: r.referred?.username || 'Unknown',
        joinedAt: r.createdAt,
        eloAwarded: r.eloAwarded
      }))
    });
  } catch (err) {
    logger.error(err, 'Failed to fetch referral history');
    res.status(500).json({ message: 'Failed to fetch referral history.' });
  }
});

router.get('/validate/:code', async (req, res) => {
  try {
    const referrer = await User.findOne({
      referralCode: req.params.code.toUpperCase()
    }).select('username');

    if (!referrer) {
      return res.status(404).json({ valid: false, message: 'Invalid referral code.' });
    }

    res.json({ valid: true, referrerUsername: referrer.username });
  } catch (err) {
    logger.error(err, 'Failed to validate referral code');
    res.status(500).json({ message: 'Failed to validate referral code.' });
  }
});

router.post('/apply', auth, async (req, res) => {
  try {
    const { referralCode } = req.body;
    const currentUser = await User.findById(req.user.id);
    
    if (!currentUser) return res.status(404).json({ message: 'User not found.' });

    // Ensure user is within the 24h window for manual apply
    const accountAgeMs = Date.now() - new Date(currentUser.createdAt).getTime();
    const MAX_AGE_MS = 24 * 60 * 60 * 1000;
    if (accountAgeMs > MAX_AGE_MS) {
      return res.status(400).json({ message: 'Referral codes can only be applied within 24 hours of registration.' });
    }

    const result = await referralService.processReferral(currentUser, referralCode);

    if (result.success) {
      res.json({
        message: `Referral accepted! Both you and ${result.referrerName} received +${ELO_REWARD} Elo across all sectors.`,
        eloAwarded: ELO_REWARD
      });
    } else {
      res.status(400).json({ message: result.reason || 'Referral rejected.' });
    }
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Referral already applied.' });
    }
    logger.error(err, 'Failed to apply referral');
    res.status(500).json({ message: 'Failed to apply referral.' });
  }
});

module.exports = router;
