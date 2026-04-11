const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const SENDER_EMAIL = process.env.SES_SENDER_EMAIL || "no-reply@elix.it.com";

/**
 * Sends a verification email to a new user
 * @param {string} toEmail - Recipient email
 * @param {string} token - Verification token
 * @param {string} username - Recipient username
 */
const sendVerificationEmail = async (toEmail, token, username) => {
  const verificationLink = `${process.env.FRONTEND_URL}/verify-email/${token}`;

  const params = {
    Source: SENDER_EMAIL,
    Destination: {
      ToAddresses: [toEmail],
    },
    Message: {
      Subject: {
        Data: "Verify your Elix Account 🛡️",
        Charset: "UTF-8",
      },
      Body: {
        Html: {
          Data: `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
              <h1 style="color: #4f46e5; text-align: center;">Welcome to Elix, ${username}!</h1>
              <p style="font-size: 16px; color: #475569; line-height: 1.6;">
                You're almost there. To start your journey in the Survival Arena, please verify your email address.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationLink}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                  Verify Email Address
                </a>
              </div>
              <p style="font-size: 14px; color: #94a3b8; text-align: center;">
                If you didn't create an account with Elix, you can ignore this email.
              </p>
              <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 20px 0;">
              <p style="font-size: 12px; color: #cbd5e1; text-align: center;">
                &copy; 2026 Elix - Survival Duel Arena. All rights reserved.
              </p>
            </div>
          `,
          Charset: "UTF-8",
        },
      },
    },
  };

  try {
    // const command = new SendEmailCommand(params);
    // const result = await sesClient.send(command);
    console.log("SIMULATED: Verification email would be sent to:", toEmail);
    console.log("Verification Link:", verificationLink);
    return { MessageId: "simulated-id-" + Date.now() };
  } catch (error) {
    console.error("Error in simulated email send:", error);
    return { MessageId: "simulated-error-id" };
  }
};

module.exports = {
  sendVerificationEmail,
};
