const admin = require('firebase-admin');

/**
 * Firebase Admin SDK Initialization
 * This service is used exclusively for verifying Google Social Login tokens.
 * All subsequent session management is handled by our native JWT system.
 */
if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } catch (err) {
      console.error('FIREBASE_SERVICE_ACCOUNT_PARSE_ERROR:', err.message);
      // Fallback to project ID if JSON is invalid
      admin.initializeApp({
        projectId: 'coreectwayfirebase'
      });
    }
  } else {
    admin.initializeApp({
      projectId: 'coreectwayfirebase'
    });
  }
}

const auth = admin.auth();

module.exports = {
  admin,
  auth,
  verifyIdToken: (token) => auth.verifyIdToken(token)
};
