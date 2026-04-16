const admin = require('firebase-admin');

/**
 * Firebase Admin SDK Initialization
 * This service is used exclusively for verifying Google Social Login tokens.
 * All subsequent session management is handled by our native JWT system.
 */
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'coreectwayfirebase'
  });
}

const auth = admin.auth();

module.exports = {
  admin,
  auth,
  verifyIdToken: (token) => auth.verifyIdToken(token)
};
