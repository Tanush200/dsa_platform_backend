const { Resend } = require('resend');
const logger = require('../utils/logger');

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send a verification email to a new user.
 */
exports.sendVerificationEmail = async (email, token, username) => {
    try {
        const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${token}`;
        
        await resend.emails.send({
            from: 'Elix Arena <hello@elix.it.com>',
            to: email,
            subject: 'Verify your Elix Arena Account',
            text: `Hello ${username}, welcome to Elix Arena. Please verify your account using this link: ${verifyUrl}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; background: #fafafa; color: #111; padding: 40px; border-radius: 12px; border: 1px solid #eee;">
                    <h2 style="color: #000; margin-bottom: 20px;">Welcome to the Arena, ${username}</h2>
                    <p style="margin: 20px 0; line-height: 1.6; color: #444;">To finalize your registration and begin your survival journey, please verify your email address by clicking the button below.</p>
                    <div style="margin: 30px 0;">
                        <a href="${verifyUrl}" style="display: inline-block; background: #E8C547; color: #000; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; text-transform: uppercase; font-size: 14px;">Verify Account</a>
                    </div>
                    <p style="margin-top: 30px; font-size: 12px; color: #888; border-top: 1px solid #eee; pt: 20px;">
                        If you did not sign up for Elix Arena, you can safely ignore this email.
                    </p>
                </div>
            `
        });
        
        logger.info({ email }, 'Verification email sent via Resend');
    } catch (err) {
        logger.error({ err: err.message, stack: err.stack, email }, 'Failed to send verification email');
        throw new Error(`Email transmission failed: ${err.message}`);
    }
};

/**
 * Send a temporary password to a legacy Firebase user.
 */
exports.sendMigrationEmail = async (email, tempPassword, username) => {
    try {
        await resend.emails.send({
            from: 'Elix Arena <hello@elix.it.com>',
            to: email,
            subject: 'Account Migration - Elix Arena',
            text: `Hello ${username}, your account has been migrated. Use temporary password: ${tempPassword}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; background: #fafafa; color: #111; padding: 40px; border-radius: 12px; border: 1px solid #eee;">
                    <h2 style="color: #000; margin-bottom: 20px;">Identity Restored</h2>
                    <p style="margin: 20px 0; line-height: 1.6; color: #444;">Hello ${username}, we have successfully transitioned your account to our new secure identity system.</p>
                    <p style="margin: 20px 0; line-height: 1.6; color: #444;">Use the temporary <strong>Access Secret</strong> below to log in. Please change it immediately in your settings.</p>
                    <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #E8C547; text-align: center; margin: 25px 0;">
                        <span style="font-family: monospace; font-size: 24px; color: #000; letter-spacing: 5px; font-weight: bold;">${tempPassword}</span>
                    </div>
                    <p style="margin-top: 30px; font-size: 12px; color: #888;">Safe travels in the Arena.</p>
                </div>
            `
        });
        
        logger.info({ email }, 'Migration email sent via Resend');
    } catch (err) {
        logger.error({ err, email }, 'Failed to send migration email');
        throw new Error('Migration email failed.');
    }
};

/**
 * Send a password reset link to a user.
 */
exports.sendPasswordResetEmail = async (email, token, username) => {
    try {
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;
        
        await resend.emails.send({
            from: 'Elix Arena <hello@elix.it.com>',
            to: email,
            subject: 'Reset your Elix Arena Password',
            text: `Use this link to reset your password: ${resetUrl}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; background: #fafafa; color: #111; padding: 40px; border-radius: 12px; border: 1px solid #eee;">
                    <h2 style="color: #000; margin-bottom: 20px;">Password Reset Requested</h2>
                    <p style="margin: 20px 0; line-height: 1.6; color: #444;">An access override has been requested for your profile. Click the button below to set a new password. This link expires in 1 hour.</p>
                    <div style="margin: 30px 0;">
                        <a href="${resetUrl}" style="display: inline-block; background: #000; color: #E8C547; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; text-transform: uppercase;">Reset Password</a>
                    </div>
                    <p style="margin-top: 30px; font-size: 12px; color: #888;">If you did not request this, you can ignore this email.</p>
                </div>
            `
        });
        
        logger.info({ email }, 'Password reset email sent via Resend');
    } catch (err) {
        logger.error({ err, email }, 'Failed to send password reset email');
        throw new Error('Override transmission failed.');
    }
};
