const express = require('express');
const router = express.Router();
const Problem = require('../models/Problem');
const { auth, admin } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const problems = await Problem.find().sort({ order: 1, createdAt: 1 }).lean();
    res.json(problems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.post('/', [auth, admin], async (req, res) => {
  try {
    const { title, topic, pattern, difficulty, leetcodeLink } = req.body;

    const maxOrder = await Problem.countDocuments();
    const newProblem = new Problem({ title, topic, pattern, difficulty, leetcodeLink, order: maxOrder });
    await newProblem.save();
    res.status(201).json(newProblem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.post('/reorder', [auth, admin], async (req, res) => {
  try {
    const updates = req.body;
    const ops = updates.map(({ _id, order }) => ({
      updateOne: {
        filter: { _id },
        update: { $set: { order } }
      }
    }));
    await Problem.bulkWrite(ops);
    res.json({ message: 'Order updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.put('/:id', [auth, admin], async (req, res) => {
  try {
    const updatedProblem = await Problem.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, returnDocument: 'after' }
    );
    res.json(updatedProblem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.delete('/:id', [auth, admin], async (req, res) => {
  try {
    await Problem.findByIdAndDelete(req.params.id);
    res.json({ message: 'Problem deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
