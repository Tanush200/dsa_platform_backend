const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { auth } = require('../middleware/auth');

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/timeline', auth, async (req, res) => {
  try {
    const { durationDays } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        targetDurationDays: durationDays,
        startDate: new Date()
      },
      { new: true }
    ).select('-password');

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/nickname', auth, async (req, res) => {
  try {
    const { nickname } = req.body;
    if (!nickname || nickname.length < 3 || nickname.length > 15) {
      return res.status(400).json({ message: 'Nickname must be between 3 and 15 characters' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { nickname },
      { new: true }
    ).select('-password');

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/email', auth, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ message: 'Valid email is required' });
    }

    // Check if email already taken
    const existingUser = await User.findOne({ email, _id: { $ne: req.user.id } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const verificationToken = require('uuid').v4();
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { 
        email, 
        isVerified: false, 
        verificationToken 
      },
      { new: true }
    ).select('-password');

    // Send new verification email
    const { sendVerificationEmail } = require('../services/emailService');
    await sendVerificationEmail(email, verificationToken, user.username);

    res.json({ 
      message: 'Email updated! Please verify your new email address.',
      user 
    });
  } catch (err) {
    console.error("Email update error:", err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
