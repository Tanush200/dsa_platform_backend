const express = require('express');
const router = express.Router();
const { noCache } = require('../middleware/cache');
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const DuelProfile = require('../models/DuelProfile');
const Referral = require('../models/Referral');
const logger = require('../utils/logger');

router.use(noCache);

const ELO_REWARD = 50;
const DOMAINS = ['cs', 'aptitude', 'gk', 'ece', 'me', 'ce', 'upsc'];

const normalizeEmail = (email) => {
  if (!email) return '';
  const [local, domain] = email.toLowerCase().split('@');
  let base = local.split('+')[0];
  if (domain === 'gmail.com') {
    base = base.replace(/\./g, '');
  }
  return `${base}@${domain}`;
};


const awardReferralElo = async (userId, attempt = 0) => {
  try {
    let profile = await DuelProfile.findOne({ user: userId });
    if (!profile) {
      profile = new DuelProfile({
        user: userId,
        elo: 1000 + ELO_REWARD,
        survivalElo: 1000 + ELO_REWARD
      });
      DOMAINS.forEach(d => profile.domainStats.set(d, { elo: 1000 + ELO_REWARD }));
    } else {
      profile.elo += ELO_REWARD;
      profile.survivalElo += ELO_REWARD;
      DOMAINS.forEach(d => {
        const stats = profile.domainStats.get(d) || { elo: 1000 };
        stats.elo += ELO_REWARD;
        profile.domainStats.set(d, stats);
      });
    }
    await profile.save();
  } catch (err) {
    if (err.name === 'VersionError' && attempt < 3) {
      return awardReferralElo(userId, attempt + 1);
    }
    throw err;
  }
};

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

    if (!referralCode) {
      return res.status(400).json({ message: 'Referral code is required.' });
    }

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (currentUser.referredBy) {
      return res.status(400).json({ message: 'You have already used a referral code.' });
    }

    const accountAgeMs = Date.now() - new Date(currentUser.createdAt).getTime();
    const MAX_AGE_MS = 24 * 60 * 60 * 1000;
    if (accountAgeMs > MAX_AGE_MS) {
      return res.status(400).json({
        message: 'Referral codes can only be applied within 24 hours of registration.'
      });
    }

    const referrer = await User.findOne({
      referralCode: referralCode.toUpperCase()
    });

    if (!referrer) {
      return res.status(404).json({ message: 'Invalid referral code.' });
    }

    if (referrer._id.toString() === currentUser._id.toString()) {
      return res.status(400).json({ message: 'You cannot use your own referral code.' });
    }

    const referrerNormalized = normalizeEmail(referrer.email);
    const currentNormalized = normalizeEmail(currentUser.email);

    if (referrerNormalized && currentNormalized && referrerNormalized === currentNormalized) {
      logger.warn({
        referrerId: referrer._id,
        referredId: currentUser._id,
        email: referrer.email
      }, 'Suspicious referral: identical normalized email detected');
      return res.status(400).json({ message: 'Referral rejected. Suspicious activity detected.' });
    }

    const existingReferral = await Referral.findOne({ referred: currentUser._id });
    if (existingReferral) {
      return res.status(400).json({ message: 'Referral already applied.' });
    }

    const referral = new Referral({
      referrer: referrer._id,
      referred: currentUser._id,
      eloAwarded: true
    });
    await referral.save();

    await awardReferralElo(referrer._id);
    await awardReferralElo(currentUser._id);

    currentUser.referredBy = referrer._id;
    await currentUser.save();

    referrer.referralCount = (referrer.referralCount || 0) + 1;
    await referrer.save();

    logger.info({
      referrerId: referrer._id,
      referredId: currentUser._id,
      referralCode
    }, 'Referral successfully applied');

    res.json({
      message: `Referral accepted! Both you and ${referrer.username} received +${ELO_REWARD} Elo across all sectors.`,
      eloAwarded: ELO_REWARD
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Referral already applied.' });
    }
    logger.error(err, 'Failed to apply referral');
    res.status(500).json({ message: 'Failed to apply referral.' });
  }
});

module.exports = router;
