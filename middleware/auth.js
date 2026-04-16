const admin = require('../lib/firebaseAdmin');
const User = require('../models/User');
const { getJson, setJson } = require('../services/redis');

async function auth(req, res, next) {
  const token = req.header('Authorization')?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    decodedToken = await admin.auth().verifyIdToken(token);

    const cacheKey = `user:session:${decodedToken.uid}`;
    let user = await getJson(cacheKey);

    if (!user) {
      user = await User.findOne({
        $or: [{ firebaseUid: decodedToken.uid }, { email: decodedToken.email }]
      }).lean();

      if (user) {
        await setJson(cacheKey, user, 600).catch(() => { });
      }
    }

    if (!user) {
      return res.status(403).json({
        code: 'PROFILE_MISSING',
        message: 'Firebase identity verified, but MongoDB profile missing. Sync required.',
        firebaseUser: { uid: decodedToken.uid, email: decodedToken.email }
      });
    }

    // 🛡️ Automatic Verification Sync
    // If Firebase says the email is verified but MongoDB doesn't, update MongoDB
    if (decodedToken.email_verified && !user.isVerified) {
      await User.findByIdAndUpdate(user._id, { isVerified: true });
      user.isVerified = true;
      // Clear cache to ensure local user object is fresh
      await del(cacheKey).catch(() => {});
    }

    req.user = {
      id: user._id,
      _id: user._id,
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: user.role,
      username: user.username,
      isVerified: user.isVerified || decodedToken.email_verified
    };

    next();
  } catch (error) {
    console.error('Firebase Auth Middleware Error:', error);
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

async function adminMiddleware(req, res, next) {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Administrative authority required.' });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error verifying admin status.' });
  }
}

module.exports = { auth, admin: adminMiddleware };
