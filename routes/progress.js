const express = require('express');
const router = express.Router();
const { noCache } = require('../middleware/cache');


router.use(noCache);

const Progress = require('../models/Progress');
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const { recordSolve } = require('../services/userActivityService');

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
        await recordSolve(req.user.id);
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
