const nodemailer = require('nodemailer');

// Create reusable transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // Use TLS
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    },
    tls: {
        // Do not fail on invalid certs
        rejectUnauthorized: false
    },
    debug: true, // Enable debug logging
    logger: true  // Log to console
});

// Generate OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000)
        .toString()
        .match(/.{1,3}/g)
        .join('-');
}

// Verify transport connection
async function verifyConnection() {
    try {
        await transporter.verify();
        console.log('SMTP connection verified successfully');
        return true;
    } catch (error) {
        console.error('SMTP verification failed:', error);
        return false;
    }
}

// Send OTP Email
async function sendOTPEmail(email, otp) {
    // Verify connection first
    await verifyConnection();
    
    const mailOptions = {
        from: process.env.GMAIL_USER,
        to: email,
        subject: 'Verify Your Email - Black Rock',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Verify Your Email Address</h2>
                <p>Thank you for signing up! Please use the following verification code to complete your registration:</p>
                <div style="background: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
                    <strong>${otp}</strong>
                </div>
                <p>This code will expire in 10 minutes.</p>
                <p>If you didn't request this verification, please ignore this email.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="color: #666; font-size: 12px;">This is an automated message, please do not reply.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Email send error:', error);
        return false;
    }
}

// Send password reset email with a link
async function sendResetPasswordEmail(email, link) {
    await verifyConnection();
    const mailOptions = {
        from: process.env.GMAIL_USER,
        to: email,
        subject: 'Reset your password - Black Rock',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Reset your password</h2>
                <p>We received a request to reset the password for your account. Click the button below to choose a new password. This link will expire in 1 hour.</p>
                <div style="text-align:center; margin: 18px 0;">
                    <a href="${link}" style="display:inline-block; padding:12px 20px; background:#15b37a; color:#fff; border-radius:6px; text-decoration:none;">Reset password</a>
                </div>
                <p>If you didn't request a password reset, you can safely ignore this email.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="color: #666; font-size: 12px;">This is an automated message, please do not reply.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Reset email send error:', error);
        return false;
    }
}

// Send account verification confirmation email
async function sendVerificationConfirmationEmail(email, firstName) {
    await verifyConnection();
    const mailOptions = {
        from: process.env.GMAIL_USER,
        to: email,
        subject: 'Account Verified - Black Rock',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h1 style="color: #15b37a;">✓ Account Verified</h1>
                </div>
                <p>Hi ${firstName},</p>
                <p>Great news! Your account has been successfully verified. You now have full access to all features on Black Rock.</p>
                <div style="background: #f0fdf4; border-left: 4px solid #15b37a; padding: 15px; margin: 20px 0;">
                    <p style="margin: 0; color: #15b37a;"><strong>Your account is now fully verified and active.</strong></p>
                </div>
                <p>You can now:</p>
                <ul style="color: #333;">
                    <li>Make unlimited transactions</li>
                    <li>Withdraw funds without restrictions</li>
                    <li>Access all premium features</li>
                    <li>Enjoy priority customer support</li>
                </ul>
                <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
                <div style="text-align: center; margin: 25px 0;">
                    <a href="http://localhost:3000/dashboard.html" style="display:inline-block; padding:12px 24px; background:#15b37a; color:#fff; border-radius:6px; text-decoration:none; font-weight:bold;">Go to Dashboard</a>
                </div>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="color: #666; font-size: 12px;">This is an automated message, please do not reply.</p>
                <p style="color: #999; font-size: 11px; text-align: center;">Black Rock Investment Platform | © 2025</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Verification confirmation email sent to ${email}`);
        return true;
    } catch (error) {
        console.error('Verification email send error:', error);
        return false;
    }
}

module.exports = {
    generateOTP,
    sendOTPEmail,
    sendResetPasswordEmail,
    sendVerificationConfirmationEmail
};