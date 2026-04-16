const User = require('../models/User');
const DuelProfile = require('../models/DuelProfile');
const Referral = require('../models/Referral');
const logger = require('../utils/logger');

const ELO_REWARD = 50;
const DOMAINS = ['cs', 'aptitude', 'gk', 'ece', 'me', 'ce', 'upsc'];

/**
 * Normalizes emails for basic anti-fraud (like Gmail dot/plus tricks)
 */
const normalizeEmail = (email) => {
  if (!email) return '';
  const [local, domain] = email.toLowerCase().split('@');
  let base = local.split('+')[0];
  if (domain === 'gmail.com') {
    base = base.replace(/\./g, '');
  }
  return `${base}@${domain}`;
};

/**
 * Awards Elo points to a user's profile across all domains
 */
const awardElo = async (userId, attempt = 0) => {
  try {
    let profile = await DuelProfile.findOne({ user: userId });
    
    if (!profile) {
      profile = new DuelProfile({
        user: userId,
        elo: 1000 + ELO_REWARD,
        survivalElo: 1000 + ELO_REWARD
      });
      DOMAINS.forEach(d => {
        profile.domainStats.set(d, { elo: 1000 + ELO_REWARD });
      });
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
      return awardElo(userId, attempt + 1);
    }
    throw err;
  }
};

/**
 * Processes a referral link between two users
 */
const processReferral = async (referredUser, referralCode) => {
  try {
    if (!referralCode) return { success: false, reason: 'No code provided' };

    // 1. Find Referrer
    const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
    if (!referrer) return { success: false, reason: 'Invalid referral code' };

    // 2. Prevent Self-Referral
    if (referrer._id.toString() === referredUser._id.toString()) {
      return { success: false, reason: 'Self-referral detected' };
    }

    // 3. Prevent Duplicate Referral
    const existing = await Referral.findOne({ referred: referredUser._id });
    if (existing) return { success: false, reason: 'Referral already applied' };

    // 4. Basic Fraud Check
    const refEmail = normalizeEmail(referrer.email);
    const userEmail = normalizeEmail(referredUser.email);
    if (refEmail && userEmail && refEmail === userEmail) {
      logger.warn({ ref: referrer._id, user: referredUser._id }, 'Suspicious referral: email match');
      return { success: false, reason: 'Account security restriction' };
    }

    // 5. Create Record
    const referral = new Referral({
      referrer: referrer._id,
      referred: referredUser._id,
      eloAwarded: true
    });
    await referral.save();

    // 6. Award Bonuses
    await awardElo(referrer._id);
    await awardElo(referredUser._id);

    // 7. Update User Metadata
    referredUser.referredBy = referrer._id;
    await referredUser.save();

    referrer.referralCount = (referrer.referralCount || 0) + 1;
    await referrer.save();

    logger.info({ ref: referrer._id, user: referredUser._id }, 'Referral bonus awarded');
    return { success: true, referrerName: referrer.username };

  } catch (err) {
    logger.error(err, 'Critical referral service failure');
    throw err;
  }
};

module.exports = {
  processReferral,
  awardElo,
  normalizeEmail
};
