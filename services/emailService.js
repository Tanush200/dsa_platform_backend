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
            text: `Hello ${username}, please verify your account using this link: ${verifyUrl}`,
            html: `
                <p>Hello ${username},</p>
                <p>Thank you for joining Elix Arena. Please click the link below to verify your email address and activate your account:</p>
                <p><a href="${verifyUrl}">${verifyUrl}</a></p>
                <br />
                <p>If you did not sign up for this account, please ignore this email.</p>
                <p>Best regards,<br />The Elix Team</p>
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
                <p>Hello ${username},</p>
                <p>We've updated our identity system. Use the temporary password below to log in:</p>
                <p><strong>${tempPassword}</strong></p>
                <p>We recommend changing this password immediately after logging in.</p>
                <p>See you in the Arena!</p>
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
                <p>Hello ${username},</p>
                <p>You requested a password reset. Please click the link below to set a new password:</p>
                <p><a href="${resetUrl}">${resetUrl}</a></p>
                <p>This link will expire in 1 hour.</p>
            `
        });
        
        logger.info({ email }, 'Password reset email sent via Resend');
    } catch (err) {
        logger.error({ err, email }, 'Failed to send password reset email');
        throw new Error('Override transmission failed.');
    }
};
