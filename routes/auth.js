const express = require('express');
const router = express.Router();
const { noCache } = require('../middleware/cache');


router.use(noCache);

const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');
const crypto = require('crypto');

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    let existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({
        message: existingUser.username === username ? 'Username already taken' : 'Email already registered'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const verificationToken = uuidv4();

    const user = new User({
      username,
      email,
      password: hashedPassword,
      role: 'student',
      verificationToken,
      isVerified: true
    });

    await user.save();

    // Verification emails disabled for now
    /*
    try {
      await sendVerificationEmail(email, verificationToken, username);
    } catch (emailErr) {
      console.error("Failed to send verification email:", emailErr);
    }
    */

    res.json({
      message: 'Registration successful! You can now log in.',
      user: { id: user._id, username, email, isVerified: true }
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({ verificationToken: token });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification token' });
    }

    user.isVerified = true;
    user.verificationToken = null;
    await user.save();

    res.json({ message: 'Email verified successfully! You can now log in.' });
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({ error: 'Internal server error during verification' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ $or: [{ username }, { email: username }] }); // Allow login with email too

    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    /*
    if (!user.isVerified) {
       return res.status(401).json({ message: 'Please verify your email before logging in.' });
    }
    */

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, role: user.role, username: user.username },
      process.env.JWT_SECRET || 'superDsaSecretKey2026!',
      { expiresIn: '1d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.json({ user: { id: user._id, username: user.username, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/logout', (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    expires: new Date(0)
  });
  res.json({ message: 'Logged out successfully' });
});


const { auth } = require('../middleware/auth');
router.get('/socket-token', auth, (req, res) => {
  try {
    const socketToken = jwt.sign(
      {
        id: req.user.id,
        username: req.user.username,
        type: 'socket_admission'
      },
      process.env.JWT_SECRET || 'superDsaSecretKey2026!',
      { expiresIn: '5m' }
    );

    res.json({ token: socketToken });
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate socket token' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User with this email does not exist' });

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    await sendPasswordResetEmail(email, resetToken, user.username);

    res.json({ message: 'Password reset link sent to your email.' });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: 'Password reset successful! You can now log in with your new password.' });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
