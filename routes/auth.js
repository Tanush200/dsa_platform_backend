const express = require('express');
const router = express.Router();
const { noCache } = require('../middleware/cache');
const User = require('../models/User');
const admin = require('../lib/firebaseAdmin');

router.use(noCache);

// Sync/Register user from Firebase
router.post('/register', async (req, res) => {
  try {
    const { username, email, firebaseUid } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Missing Authorization header' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    
    // Verify the token manually for registration sync
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    if (decodedToken.uid !== firebaseUid) {
      return res.status(401).json({ message: 'Identity mismatch detected.' });
    }

    // Check if MongoDB user exists
    let user = await User.findOne({ 
      $or: [{ username }, { email }, { firebaseUid }] 
    });

    if (user) {
      if (user.username === username && user.firebaseUid !== firebaseUid) {
        return res.status(400).json({ message: 'Username already taken by another survivor.' });
      }
      // If user exists, just ensure firebaseUid is linked
      if (!user.firebaseUid) {
        user.firebaseUid = firebaseUid;
        await user.save();
      }
    } else {
      // Create new MongoDB profile linked to Firebase identity
      user = new User({
        username,
        email,
        firebaseUid,
        role: 'student',
        isVerified: true // Firebase handles verification status
      });
      await user.save();
    }

    res.json({
      message: 'Induction successful! Profile synced with the Arena.',
      user: { id: user._id, username, email }
    });
  } catch (error) {
    console.error("Registration sync error:", error);
    res.status(500).json({ error: 'Failed to sync identity profile.' });
  }
});

router.post('/logout', (req, res) => {
  // We don't have cookies anymore, but keeping for compatibility
  res.cookie('token', '', { expires: new Date(0) });
  res.json({ message: 'Logged out from Arena persistence layer.' });
});

module.exports = router;
