const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJson, setJson, del } = require('../services/redis');

async function auth(req, res, next) {
  const token = req.header('Authorization')?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const cacheKey = `user:session:${decoded.id}`;
    let user = await getJson(cacheKey);

    if (!user) {
      user = await User.findById(decoded.id).lean();

      if (user) {
        await setJson(cacheKey, user, 600).catch(() => { });
      }
    }

    if (!user) {
      return res.status(401).json({ message: 'Identity invalid or profile deleted.' });
    }

    req.user = {
      id: user._id,
      _id: user._id,
      email: user.email,
      role: user.role,
      username: user.username,
      isVerified: user.isVerified
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Core session expired. Re-authenticate.' });
    }
    console.error('Auth Middleware Error:', error);
    res.status(401).json({ message: 'Invalid identity token.' });
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
