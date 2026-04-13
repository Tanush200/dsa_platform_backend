const express = require('express');
const router = express.Router();
const { noCache } = require('../middleware/cache');
const User = require('../models/User');
const admin = require('../lib/firebaseAdmin');

router.use(noCache);

router.post('/register', async (req, res) => {
  try {
    const { username, email, firebaseUid } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Missing Authorization header' });
    }

    const idToken = authHeader.split('Bearer ')[1];

    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (decodedToken.uid !== firebaseUid) {
      return res.status(401).json({ message: 'Identity mismatch detected.' });
    }

    let user = await User.findOne({
      $or: [{ email }, { firebaseUid }]
    });

    if (user) {
      if (user.firebaseUid === firebaseUid) {
        return res.json({
          message: 'Identity confirmed. Welcome back, Survivor.',
          user: { id: user._id, username: user.username, email: user.email }
        });
      }

      if (!user.firebaseUid) {
        user.firebaseUid = firebaseUid;
        await user.save();
        return res.json({
          message: 'Legacy identity securely linked to Firebase.',
          user: { id: user._id, username: user.username, email: user.email }
        });
      }

      if (user.firebaseUid !== firebaseUid) {
        return res.status(401).json({ message: 'Identity conflict detected. Registry access denied.' });
      }
    } else {
      const usernameCheck = await User.findOne({ username });
      if (usernameCheck) {
        return res.status(400).json({ message: 'Codename already active in the arena. Choose another.' });
      }

      user = new User({
        username,
        email,
        firebaseUid,
        role: 'student',
        isVerified: true
      });
      await user.save();
    }

    res.json({
      message: 'Induction successful! Profile synced with the Arena.',
      user: { id: user._id, username: user.username, email: user.email }
    });
  } catch (error) {
    console.error("Registration sync error:", error);
    res.status(500).json({ error: 'Failed to sync identity profile.' });
  }
});

router.post('/logout', (req, res) => {
  res.cookie('token', '', { expires: new Date(0) });
  res.json({ message: 'Logged out from Arena persistence layer.' });
});

const jwt = require('jsonwebtoken');
const { auth: protect } = require('../middleware/auth');
const verifyGate = require('../middleware/verifyGate');

// We apply verifyGate BEFORE issuing a socket token!
// This stops unverified users from connecting to the socket at all.
router.get('/socket-token', protect, verifyGate, async (req, res) => {
  try {
    const token = jwt.sign(
      { 
        id: req.user._id, 
        username: req.user.username,
        type: 'socket_admission' 
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Uplink generation failed.' });
  }
});

module.exports = router;
