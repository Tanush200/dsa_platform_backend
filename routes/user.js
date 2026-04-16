const express = require('express');
const router = express.Router();
const { noCache } = require('../middleware/cache');


router.use(noCache);

const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { del } = require('../services/redis');

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -solveHistory');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/solve-history', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('solveHistory currentStreak maxStreak lastSolvedDate');

    if (user && user.lastSolvedDate && user.currentStreak > 0) {
      const istNow = new Date();
      const istTodayStr = istNow.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

      const lastSolved = new Date(user.lastSolvedDate);
      const lastSolvedStr = lastSolved.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

      if (istTodayStr !== lastSolvedStr) {
        const yesterday = new Date(istNow);
        yesterday.setDate(yesterday.getDate() - 1);
        const istYesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        if (lastSolvedStr !== istYesterdayStr) {
          user.currentStreak = 0;
          await user.save();
        }
      }
    }

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
      { returnDocument: 'after' }
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
      { returnDocument: 'after' }
    ).select('-password');
    if (user) {
      await del(`user:session:${req.user.uid}`).catch(() => { });
    }

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

    const existingUser = await User.findOne({ email, _id: { $ne: req.user.id } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        email,
        isVerified: false,
      },
      { returnDocument: 'after' }
    ).select('-password');

    if (user) {
      await del(`user:session:${req.user.uid}`).catch(() => { });
    }

    res.json({
      message: 'Uplink updated. Please verify your new address via your dashboard or inbox.',
      user
    });
  } catch (err) {
    console.error("Email update error:", err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
