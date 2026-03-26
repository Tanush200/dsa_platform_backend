const express = require('express');
const router = express.Router();
const Progress = require('../models/Progress');
const { auth } = require('../middleware/auth');

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
    const { problemId, status, notes } = req.body;

    let progress = await Progress.findOne({ userId: req.user.id, problemId });
    if (progress) {
      if (status) progress.status = status;
      if (notes !== undefined) progress.notes = notes;
      await progress.save();
    } else {
      progress = new Progress({
        userId: req.user.id,
        problemId,
        status: status || 'Todo',
        notes: notes || ''
      });
      await progress.save();
    }

    res.json(progress);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
