const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { noCache } = require('../middleware/cache');
const User = require('../models/User');
const { sendVerificationEmail, sendMigrationEmail } = require('../services/emailService');
const { auth: protect } = require('../middleware/auth');
const firebaseAdmin = require('../lib/firebaseAdmin');
const verifyGate = require('../middleware/verifyGate');
const referralService = require('../services/referralService');

router.use(noCache);

/**
 * Custom Registration (Resend Powered)
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required for induction.' });
    }

    let existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      return res.status(400).json({ message: 'Identity conflict: Email or Codename already in use.' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    const user = new User({
      username,
      email,
      password, // Will be hashed by pre-save hook
      verificationToken,
      isVerified: false
    });

    await user.save();

    // Send verification email via Resend
    await sendVerificationEmail(email, verificationToken, username).catch(err => {
      console.error('Initial email failed, user created but unverified:', err);
    });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Induction successful. Synchronize your uplink via email.',
      token,
      user: { id: user._id, username: user.username, email: user.email, isVerified: false }
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: 'Failed to initiate identity profile.' });
  }
});

/**
 * Custom Login (JWT Powered)
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Identity not found in the Grid.' });
    }

    // 🛡️ Legacy Migration Check
    if (!user.password && user.firebaseUid) {
      const tempPass = `ELIX-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      user.password = tempPass; // This will trigger hash in pre-save
      await user.save();
      
      await sendMigrationEmail(email, tempPass, user.username);
      
      return res.status(403).json({
        code: 'MIGRATION_REQUIRED',
        message: 'Legacy account detected. A new Access Secret has been transmitted to your email. Check your inbox.'
      });
    }

    if (!password) {
        return res.status(400).json({ message: 'Access Secret required.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid Access Secret. Entry denied.' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: { id: user._id, username: user.username, email: user.email, isVerified: user.isVerified }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: 'Authentication failure.' });
  }
});

/**
 * Google Social Login (Firebase Proxy)
 */
router.post('/google-login', async (req, res) => {
  try {
    const { idToken, referralCode } = req.body;
    if (!idToken) return res.status(400).json({ message: 'Identity token required.' });

    // 1. Verify token with Firebase
    const decoded = await firebaseAdmin.verifyIdToken(idToken);
    const { email, name, picture, uid } = decoded;

    // 2. Find or Create user
    let user = await User.findOne({ email });
    let isNewUser = false;

    if (!user) {
      if (!email) {
        return res.status(400).json({ message: 'Social profile does not provide a public email. Please check your GitHub/Google privacy settings.' });
      }

      isNewUser = true;
      
      // Handle potential username collisions
      let baseUsername = name ? name.replace(/\s+/g, '_') : email.split('@')[0];
      let finalUsername = baseUsername;
      let counter = 1;

      // Check for existence and append random suffix if needed
      while (await User.findOne({ username: finalUsername })) {
        finalUsername = `${baseUsername}_${Math.floor(Math.random() * 9999)}`;
        counter++;
        if (counter > 5) break; // Safety break
      }

      // Create new account for first-time social sign-in
      user = new User({
        username: finalUsername,
        email: email,
        isVerified: true, // Social accounts are pre-verified
        firebaseUid: uid,
        nickname: name || ""
      });
      await user.save();

      // Process referral bonus if a code was provided
      if (referralCode) {
        await referralService.processReferral(user, referralCode).catch(err => {
          console.error('Initial referral processing failed:', err);
        });
      }
    } else {
      // If user exists but is not verified, verify them since Google vouched for them
      if (!user.isVerified) {
        user.isVerified = true;
        await user.save();
      }
    }

    // 3. Issue our own JWT
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      isNewUser,
      user: { id: user._id, username: user.username, email: user.email, isVerified: user.isVerified }
    });
  } catch (error) {
    console.error("Google logic failure:", error);
    res.status(401).json({ message: 'Identity verification failed. Google rejection.' });
  }
});

/**
 * Verify Email (Resend Link Handler)
 */
router.get('/verify-email/:token', async (req, res) => {
  try {
    const user = await User.findOne({ verificationToken: req.params.token });
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification token.' });
    }

    user.isVerified = true;
    user.verificationToken = null;
    await user.save();

    res.json({ message: 'Uplink synchronized. Identity verified.' });
  } catch (error) {
    res.status(500).json({ message: 'Verification failure.' });
  }
});

/**
 * Resend Verification Email
 */
router.post('/resend-verification', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.isVerified) return res.status(400).json({ message: 'Identity already verified.' });

    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.verificationToken = verificationToken;
    await user.save();

    await sendVerificationEmail(user.email, verificationToken, user.username);
    res.json({ message: 'Verification uplink re-dispatched. Check your inbox.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to re-dispatch uplink.' });
  }
});

/**
 * Forgot Password (Request Override)
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) {
      // Security: Don't reveal if user exists, but we can log it
      return res.json({ message: 'If an account exists, an override protocol has been transmitted.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    await sendPasswordResetEmail(email, resetToken, user.username);

    res.json({ message: 'Override protocol transmitted. Check your inbox.' });
  } catch (error) {
    res.status(500).json({ message: 'Override request failed.' });
  }
});

/**
 * Reset Password (Execute Override)
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Override token invalid or expired.' });
    }

    user.password = password; // Will be hashed by pre-save
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: 'Access Secret successfully synchronized. You may now log in.' });
  } catch (error) {
    res.status(500).json({ message: 'Access reset failed.' });
  }
});

router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out from Arena persistence layer.' });
});

router.get('/socket-token', protect, verifyGate, async (req, res) => {
  try {
    const token = jwt.sign(
      {
        id: req.user._id,
        username: req.user.username,
        type: 'socket_admission'
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Uplink generation failed.' });
  }
});

module.exports = router;
