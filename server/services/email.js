const nodemailer = require('nodemailer');

function createTransport() {
  const user = process.env.GMAIL_USER;
  const appPassword = process.env.GMAIL_APP_PASSWORD;
  if (!user || !appPassword) {
    throw new Error('Email OTP is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.');
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass: appPassword },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
}

async function sendOtpEmail(email, code, purpose) {
  const transport = createTransport();
  const subject = purpose === 'password_reset'
    ? 'Brahmastra Club password reset code'
    : 'Verify your Brahmastra Club email';
  const action = purpose === 'password_reset' ? 'reset your password' : 'verify your email address';

  await transport.sendMail({
    from: `"Brahmastra Arts & Sports Club" <${process.env.GMAIL_USER}>`,
    to: email,
    subject,
    text: `Your Brahmastra Club code to ${action} is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`
  });
}

module.exports = { sendOtpEmail };
