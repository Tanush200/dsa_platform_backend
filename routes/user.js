const express = require('express');
const router = express.Router();
const { noCache } = require('../middleware/cache');


router.use(noCache);

const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { del } = require('../services/redis');

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password -solveHistory')
      .populate('clanId', 'slug name tag');
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

    if (!/^[a-zA-Z0-9_]+$/.test(nickname)) {
      return res.status(400).json({ message: 'Nickname can only contain letters, numbers, and underscores' });
    }

    const existing = await User.findOne({
      nickname: { $regex: new RegExp(`^${nickname}$`, 'i') },
      _id: { $ne: req.user.id }
    });
    if (existing) {
      return res.status(409).json({ message: 'This nickname is already taken. Please choose another.' });
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


router.put('/profile-meta', auth, async (req, res) => {
  try {
    const allowed = ['bio', 'githubHandle', 'linkedinHandle', 'portfolioUrl', 'languages', 'skills'];
    const updates = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (Array.isArray(req.body[key])) {
          updates[key] = req.body[key].slice(0, 10).map(s => String(s).trim()).filter(Boolean);
        } else {
          updates[key] = String(req.body[key]).trim().substring(0, 300);
        }
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      updates,
      { returnDocument: 'after' }
    ).select('-password -solveHistory');

    if (req.user.id) {
      await del(`user:session:${req.user.id}`).catch(() => { });
    }

    res.json(user);
  } catch (err) {
    console.error('Profile meta update error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


router.delete('/me', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const Progress = require('../models/Progress');
    const DuelProfile = require('../models/DuelProfile');
    const Referral = require('../models/Referral');

    await Promise.all([
      Progress.deleteMany({ userId }),
      DuelProfile.findOneAndDelete({ userId }),
      Referral.deleteMany({ $or: [{ referrer: userId }, { referred: userId }] }),
      User.findByIdAndDelete(userId)
    ]);

    if (req.user.uid) {
      await del(`user:session:${req.user.uid}`).catch(() => { });
    }

    res.json({ message: 'Identity purged from the Arena. Your data has been erased.' });
  } catch (err) {
    console.error("Erasure failure:", err);
    res.status(500).json({ message: 'Failed to purge identity. Critical system error.' });
  }
});


router.get('/profile/:nickname', async (req, res) => {
  try {
    const { nickname } = req.params;
    const user = await User.findOne({
      nickname: { $regex: new RegExp(`^${nickname}$`, 'i') }
    }).select('nickname username bio githubHandle linkedinHandle portfolioUrl languages skills solveHistory currentStreak maxStreak lastSolvedDate');

    if (!user) {
      return res.status(404).json({ message: 'Profile not found. This operator does not exist in the Arena.' });
    }

    const Progress = require('../models/Progress');
    const Problem = require('../models/Problem');

    const [progress, problems, duelProfile] = await Promise.all([
      Progress.find({ userId: user._id }).select('problemId status -_id').lean(),
      Problem.find({}).select('_id title topic difficulty').lean(),
      require('../models/DuelProfile').findOne({ user: user._id })
        .select('survivalElo survivalRank survivalWins survivalLosses survivalBestStreak survivalTotalDuels')
        .lean(),
    ]);

    const solvedIds = new Set(progress.filter(p => p.status === 'Solved').map(p => String(p.problemId)));

    const calcDiff = (diff) => {
      const total = problems.filter(p => p.difficulty === diff).length;
      const solved = problems.filter(p => p.difficulty === diff && solvedIds.has(String(p._id))).length;
      return { solved, total };
    };
    const statsBreakdown = [
      { label: 'Easy', ...calcDiff('Easy') },
      { label: 'Medium', ...calcDiff('Medium') },
      { label: 'Hard', ...calcDiff('Hard') },
    ];

    const topicMap = {};
    problems.forEach(p => {
      const t = p.topic || 'General';
      if (!topicMap[t]) topicMap[t] = { name: t, total: 0, solved: 0 };
      topicMap[t].total++;
      if (solvedIds.has(String(p._id))) topicMap[t].solved++;
    });
    const topicBreakdown = Object.values(topicMap).sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      user: {
        nickname: user.nickname,
        bio: user.bio || '',
        githubHandle: user.githubHandle || '',
        linkedinHandle: user.linkedinHandle || '',
        portfolioUrl: user.portfolioUrl || '',
        languages: user.languages || [],
        skills: user.skills || [],
      },
      solveHistory: user.solveHistory || [],
      currentStreak: user.currentStreak || 0,
      maxStreak: user.maxStreak || 0,
      totalSolved: solvedIds.size,
      totalProblems: problems.length,
      statsBreakdown,
      topicBreakdown,
      duelProfile: duelProfile || {
        survivalElo: 1000,
        survivalRank: 'Recruit',
        survivalWins: 0,
        survivalLosses: 0,
        survivalBestStreak: 0,
        survivalTotalDuels: 0
      }
    });
  } catch (err) {
    console.error('Public profile error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


module.exports = router;
