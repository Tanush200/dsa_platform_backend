const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const { auth, admin } = require('../middleware/auth');


router.get('/pattern-order', auth, async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: 'patternOrder' });
    res.json(setting ? setting.value : []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.put('/pattern-order', [auth, admin], async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'order must be an array' });
    }
    await Settings.replaceOne(
      { key: 'patternOrder' },
      { key: 'patternOrder', value: order },
      { upsert: true }
    );
    res.json({ message: 'Pattern order saved' });
  } catch (error) {
    console.error('Settings PUT error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
