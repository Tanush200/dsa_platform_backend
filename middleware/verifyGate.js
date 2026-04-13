// Middleware to ensure a user has completed identity verification
function verifyGate(req, res, next) {
  // We assume req.user is populated by the `auth` middleware prior to this
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  // Admins bypass the verification gate implicitly based on prior project context,
  // but let's strictly check if the user is verified in the DB.
  // Note: the `auth` middleware only attaches role/email/uid. We should 
  // ensure the underlying route or token indicates verification, OR we fetch 
  // the user's verification status.
  
  // To avoid an extra DB call on every request, we will check if the user
  // document was verified in the primary `auth` middleware, OR we do it here.
  
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
