/**
 * DEPRECATED - ELIX ARENA CUSTOM IDENTITY TRANSITION
 * 
 * This file is deprecated as of April 2026. The backend has migrated to 
 * native JWT verification and MongoDB-managed user sessions.
 * 
 * Check middleware/auth.js for the new 'protect' implementation.
 * Check models/User.js for bcrypt-hashing and password management.
 */

const admin = {
  auth: () => ({
    verifyIdToken: () => {
      throw new Error('Firebase Admin verifyIdToken is DEPRECATED. Use JWT middleware.');
    }
  }),
  initializeApp: () => {}
};

module.exports = admin;
