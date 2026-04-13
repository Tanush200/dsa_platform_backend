function verifyGate(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const User = require('../models/User');

  User.findById(req.user.id)
    .then(user => {
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      if (!user.isVerified) {
        return res.status(403).json({
          code: 'UNVERIFIED_IDENTITY',
          message: 'Identity verification required to access this sector.'
        });
      }

      next();
    })
    .catch(err => {
      console.error("verifyGate Middleware Error:", err);
      res.status(500).json({ message: 'Server error during verification check.' });
    });
}

module.exports = verifyGate;
