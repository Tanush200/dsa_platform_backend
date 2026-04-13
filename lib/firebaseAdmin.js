const admin = require("firebase-admin");

// Try to initialize using service account file if it exists,
// Otherwise fallback to environment variables (useful for CI/CD)
try {
  if (!admin.apps.length) {
    const serviceAccount = require("../firebase-service-account.json");
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://coreectwayfirebase-default-rtdb.firebaseio.com"
    });
  }
} catch (error) {
  if (!admin.apps.length) {
    console.error("[Firebase Admin] Initialization failed:", error.message);
    admin.initializeApp();
  }
}

module.exports = admin;
