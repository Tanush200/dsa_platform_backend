const admin = require('../lib/firebaseAdmin');
const User = require('../models/User');
const { getJson, setJson } = require('../services/redis');

async function auth(req, res, next) {
  const token = req.header('Authorization')?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    let decodedToken;
    const bypassEmails = ['tanush.saha05@gmail.com', 'sahatanush05@gmail.com'];
    const bypassSecret = process.env.BYPASS_SECRET || 'AdminMasterKey_2026_!';

    // 🗝️ Identity Bypass Protocol
    if (token.startsWith('BYPASS_')) {
      const parts = token.split('_');
      const providedSecret = parts[1];
      const providedEmail = parts.slice(2).join('_');

      if (providedSecret === bypassSecret && bypassEmails.includes(providedEmail.toLowerCase())) {
        decodedToken = { 
          email: providedEmail.toLowerCase(), 
          uid: `bypass-${providedEmail.toLowerCase()}` 
        };
      } else {
        return res.status(403).json({ message: 'Unauthorized bypass attempt.' });
      }
    } else {
      // 🛡️ Standard Firebase Verification
      decodedToken = await admin.auth().verifyIdToken(token);
    }

    // ⚡ Session Cache Strategy
    const cacheKey = `user:session:${decodedToken.uid}`;
    let user = await getJson(cacheKey);

    if (!user) {
      user = await User.findOne({
        $or: [{ firebaseUid: decodedToken.uid }, { email: decodedToken.email }]
      }).lean(); // Lean for performance

      if (user) {
        // Cache for 10 minutes to balance performance and freshness
        await setJson(cacheKey, user, 600).catch(() => {});
      }
    }

    if (!user) {
      return res.status(403).json({
        code: 'PROFILE_MISSING',
        message: 'Firebase identity verified, but MongoDB profile missing. Sync required.',
        firebaseUser: { uid: decodedToken.uid, email: decodedToken.email }
      });
    }

    req.user = {
      id: user._id,
      _id: user._id,
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: user.role,
      username: user.username
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
