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

module.exports = router;
