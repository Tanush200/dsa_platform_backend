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
            from: 'Elix Arena <no-reply@elix.it.com>',
            to: email,
            subject: 'Verify your identity - Elix Arena',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; background: #000; color: #fff; padding: 40px; border-radius: 20px; border: 1px solid #333;">
                    <h1 style="color: #E8C547; font-style: italic; letter-spacing: -1px;">UPLINK REQUIRED</h1>
                    <p style="color: #888; text-transform: uppercase; font-size: 10px; font-weight: bold; letter-spacing: 2px;">Identity: ${username}</p>
                    <p style="margin: 20px 0; line-height: 1.6;">Welcome to the Grid. To activate your profile and enter the survival sectors, you must synchronize your uplink via the link below.</p>
                    <a href="${verifyUrl}" style="display: inline-block; background: #E8C547; color: #000; padding: 15px 30px; border-radius: 10px; text-decoration: none; font-weight: 900; text-transform: uppercase;">ACTIVATE UPLINK</a>
                    <p style="margin-top: 30px; font-size: 12px; color: #555;">If you did not initiate this induction, ignore this transmission.</p>
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
            from: 'Elix Arena <no-reply@elix.it.com>',
            to: email,
            subject: 'New Access Credentials - Elix Arena',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; background: #000; color: #fff; padding: 40px; border-radius: 20px; border: 1px solid #333;">
                    <h1 style="color: #E8C547; font-style: italic; letter-spacing: -1px;">LEGACY MIGRATION</h1>
                    <p style="margin: 20px 0; line-height: 1.6;">Hello ${username}, we have successfully transitioned from Firebase to our own internal secure identity cluster.</p>
                    <p style="margin: 20px 0; line-height: 1.6;">Use the temporary Access Secret below to re-enter the Grid. We recommend changing it immediately in your settings.</p>
                    <div style="background: #111; padding: 20px; border-radius: 10px; border: 1px dashed #E8C547; text-align: center;">
                        <span style="font-family: monospace; font-size: 24px; color: #E8C547; letter-spacing: 5px; font-weight: bold;">${tempPassword}</span>
                    </div>
                    <p style="margin-top: 30px; font-size: 12px; color: #555;">Transmission secure. See you in the Arena.</p>
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
                from: 'Elix Arena <no-reply@elix.it.com>',
            to: email,
            subject: 'Override Access Protocol - Elix Arena',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; background: #000; color: #fff; padding: 40px; border-radius: 20px; border: 1px solid #333;">
                    <h1 style="color: #E8C547; font-style: italic; letter-spacing: -1px;">OVERRIDE REQUEST</h1>
                    <p style="color: #888; text-transform: uppercase; font-size: 10px; font-weight: bold; letter-spacing: 2px;">Identity: ${username}</p>
                    <p style="margin: 20px 0; line-height: 1.6;">An access override has been requested for your profile. Synchronize a new secret via the portal below. This link expires in 1 hour.</p>
                    <a href="${resetUrl}" style="display: inline-block; background: #E8C547; color: #000; padding: 15px 30px; border-radius: 10px; text-decoration: none; font-weight: 900; text-transform: uppercase;">RESET ACCESS SECRET</a>
                    <p style="margin-top: 30px; font-size: 12px; color: #555;">If you did not authorize this override, no action is required. Your current secret remains active.</p>
                </div>
            `
        });
        
        logger.info({ email }, 'Password reset email sent via Resend');
    } catch (err) {
        logger.error({ err, email }, 'Failed to send password reset email');
        throw new Error('Override transmission failed.');
    }
};
