const express = require('express');
const router = express.Router();
const { noCache } = require('../middleware/cache');


router.use(noCache);

const Progress = require('../models/Progress');
const { auth } = require('../middleware/auth');
const User = require('../models/User');

router.get('/', auth, async (req, res) => {
  try {
    const progressList = await Progress.find({ userId: req.user.id });
    res.json(progressList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { problemId, status, notes, difficultyRating } = req.body;

    let progress = await Progress.findOne({ userId: req.user.id, problemId });
    let incomingStatus = status || (progress ? progress.status : 'Todo');
    let nextReviewDate = progress ? progress.nextReviewDate : null;

    if (incomingStatus === 'Solved') {
      const now = new Date();
      if (difficultyRating === 'Easy') nextReviewDate = new Date(new Date().setDate(now.getDate() + 21));
      else if (difficultyRating === 'Medium') nextReviewDate = new Date(new Date().setDate(now.getDate() + 7));
      else if (difficultyRating === 'Hard') nextReviewDate = new Date(new Date().setDate(now.getDate() + 3));
      else if (difficultyRating === 'None') nextReviewDate = null;

      const isNewSolve = !progress || progress.status !== 'Solved';

      if (isNewSolve) {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });


        if (!user.solveHistory) user.solveHistory = [];

        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const dayStr = String(today.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${dayStr}`;

        today.setHours(0, 0, 0, 0);

        if (user.lastSolvedDate) {
          const lastSolved = new Date(user.lastSolvedDate);
          lastSolved.setHours(0, 0, 0, 0);

          const diffTime = today.getTime() - lastSolved.getTime();
          const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays === 1) {
            user.currentStreak += 1;
            user.lastSolvedDate = today;
          } else if (diffDays > 1) {
            user.currentStreak = 1;
            user.lastSolvedDate = today;
          } else if (diffDays === 0) {
            // Already solved today, keep current streak and date
          }
        } else {
          user.currentStreak = 1;
          user.lastSolvedDate = today;
        }

        if (user.currentStreak > (user.maxStreak || 0)) {
          user.maxStreak = user.currentStreak;
        }

        const existingDay = user.solveHistory.find(d => d.date === dateString);
        if (existingDay) {
          existingDay.count += 1;
        } else {
          user.solveHistory.push({ date: dateString, count: 1 });
        }

        // Force mark modified if nested field
        user.markModified('solveHistory');
        await user.save();
      }


    } else if (incomingStatus === 'Review') {
      const now = new Date();
      nextReviewDate = new Date(new Date().setDate(now.getDate() + 1));
    } else if (incomingStatus === 'Todo') {
      nextReviewDate = null;
    }

    if (progress) {
      if (status) progress.status = status;
      if (notes !== undefined) progress.notes = notes;
      if (difficultyRating !== undefined) progress.difficultyRating = difficultyRating;
      progress.nextReviewDate = nextReviewDate;
      await progress.save();
    } else {
      progress = new Progress({
        userId: req.user.id,
        problemId,
        status: incomingStatus,
        notes: notes || '',
        difficultyRating: difficultyRating || '',
        nextReviewDate
      });
      await progress.save();
    }

    res.json(progress);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
