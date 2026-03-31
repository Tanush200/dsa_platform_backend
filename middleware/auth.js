const jwt = require('jsonwebtoken');

function auth(req, res, next) {
  // Read token from HttpOnly cookie first, fallback to Auth header
  const token = req.cookies?.token || req.header('Authorization')?.split(' ')[1];
  
  if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'superDsaSecretKey2026!');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ message: 'Invalid token.' });
  }
}

const User = require('../models/User');

async function admin(req, res, next) {
  try {
    const realUser = await User.findById(req.user.id);

    if (!realUser || realUser.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. You are not a real administrator.' });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error verifying admin status.' });
  }
}

module.exports = { auth, admin };
