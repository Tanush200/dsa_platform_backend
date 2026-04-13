const admin = require('../lib/firebaseAdmin');
const User = require('../models/User');

async function auth(req, res, next) {
  const token = req.header('Authorization')?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {

    const decodedToken = await admin.auth().verifyIdToken(token);

    let user = await User.findOne({
      $or: [{ firebaseUid: decodedToken.uid }, { email: decodedToken.email }]
    });

    if (!user) {

      return res.status(403).json({
        code: 'PROFILE_MISSING',
        message: 'Firebase identity verified, but MongoDB profile missing. Sync required.',
        firebaseUser: { uid: decodedToken.uid, email: decodedToken.email }
      });
    }

    req.user = {
      id: user._id,
      _id: user._id, // Adding for backward compatibility
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
