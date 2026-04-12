const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const SENDER_EMAIL = process.env.SES_SENDER_EMAIL || "no-reply@elix.it.com";
const APP_NAME = "Elix";
const PRIMARY_COLOR = "#4f46e5";

/**
 * Sends a verification email to a new user
 */
const sendVerificationEmail = async (toEmail, token, username) => {
  const verificationLink = `${process.env.FRONTEND_URL}/verify-email/${token}`;

  const params = {
    Source: SENDER_EMAIL,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: `Verify your ${APP_NAME} Account`, Charset: "UTF-8" },
      Body: {
        Html: {
          Data: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: ${PRIMARY_COLOR}; margin: 0; font-size: 28px; letter-spacing: -0.025em;">Welcome to ${APP_NAME}</h1>
              </div>
              <p style="font-size: 16px; color: #475569; line-height: 1.6; margin-bottom: 24px;">
                Hi ${username},<br><br>
                You're almost ready to start your journey in the Survival Arena. To activate your account and secure your data, please verify your email address.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${verificationLink}" style="background-color: ${PRIMARY_COLOR}; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px; display: inline-block;">
                  Verify Email Address
                </a>
              </div>
              <p style="font-size: 14px; color: #94a3b8; line-height: 1.5; margin-bottom: 24px;">
                This link will expire in 24 hours. If you didn't create an account with ${APP_NAME}, you can safely ignore this email.
              </p>
              <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 32px 0;">
              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
                &copy; 2026 ${APP_NAME} - Advanced DSA Combat Platform. All rights reserved.
              </p>
            </div>
          `,
          Charset: "UTF-8",
        },
        Text: {
          Data: `Welcome to ${APP_NAME}, ${username}!\n\nPlease verify your email address by following this link: ${verificationLink}\n\nIf you didn't create an account, you can safely ignore this email.`,
          Charset: "UTF-8",
        },
      },
    },
  };

  try {
    const command = new SendEmailCommand(params);
    const result = await sesClient.send(command);
    console.log("SES Email Sent Successfully. MessageId:", result.MessageId);
    return result;
  } catch (error) {
    console.error("SES Verification Email Error:", error);
    throw error;
  }
};

/**
 * Sends a password reset email
 */
const sendPasswordResetEmail = async (toEmail, token, username) => {
  const resetLink = `${process.env.FRONTEND_URL}/reset-password/${token}`;

  const params = {
    Source: SENDER_EMAIL,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: `Reset your ${APP_NAME} Password`, Charset: "UTF-8" },
      Body: {
        Html: {
          Data: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; padding: 40px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: ${PRIMARY_COLOR}; margin: 0; font-size: 28px; letter-spacing: -0.025em;">Password Reset Request</h1>
              </div>
              <p style="font-size: 16px; color: #475569; line-height: 1.6; margin-bottom: 24px;">
                Hi ${username},<br><br>
                We received a request to reset your password for your ${APP_NAME} account. Click the button below to choose a new password.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${resetLink}" style="background-color: ${PRIMARY_COLOR}; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px; display: inline-block;">
                  Reset Password
                </a>
              </div>
              <p style="font-size: 14px; color: #94a3b8; line-height: 1.5; margin-bottom: 24px;">
                This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email and your password will remain unchanged.
              </p>
              <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 32px 0;">
              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
                &copy; 2026 ${APP_NAME} - Advanced DSA Combat Platform. All rights reserved.
              </p>
            </div>
          `,
          Charset: "UTF-8",
        },
        Text: {
          Data: `Hi ${username},\n\nWe received a request to reset your password. Click the following link to choose a new password: ${resetLink}\n\nIf you didn't request this, you can safely ignore this email.`,
          Charset: "UTF-8",
        },
      },
    },
  };

  try {
    const command = new SendEmailCommand(params);
    const result = await sesClient.send(command);
    return result;
  } catch (error) {
    console.error("SES Password Reset Email Error:", error);
    throw error;
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};
