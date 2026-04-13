const admin = require('../lib/firebaseAdmin');
const User = require('../models/User');

async function auth(req, res, next) {
  const token = req.header('Authorization')?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    // 1. Verify token with Firebase
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // 2. Find internal MongoDB user by firebaseUid (or email for legacy sync)
    let user = await User.findOne({ 
      $or: [{ firebaseUid: decodedToken.uid }, { email: decodedToken.email }] 
    });

    if (!user) {
      // User is verified by Firebase but doesn't have a profile in our DB yet.
      // This is expected during the first few seconds of registration sync.
      return res.status(403).json({ 
        message: 'Firebase identity verified, but MongoDB profile missing. Sync required.',
        firebaseUser: { uid: decodedToken.uid, email: decodedToken.email }
      });
    }

    // 3. Inject user data for existing routes to use
    req.user = {
      id: user._id,
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
