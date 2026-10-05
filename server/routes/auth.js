const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { findValidChallenge, isValidEmail, issueOtp, normalizeEmail } = require('../services/otp');

const router = express.Router();

const GENERIC_RESET_RESPONSE = 'If the account has a verified email, a reset code has been sent.';

router.post('/email/verification/request', requireAuth, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address' });

  const member = db.prepare('SELECT member_id, email, email_verified_at FROM members WHERE member_id = ?')
    .get(req.user.memberId);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  if (member.email && member.email.toLowerCase() === email && member.email_verified_at) {
    return res.json({ message: 'This email is already verified for your account' });
  }

  const existing = db.prepare(`
    SELECT member_id FROM members
    WHERE lower(email) = ? AND email_verified_at IS NOT NULL AND member_id != ?
  `).get(email, member.member_id);
  if (existing) return res.status(409).json({ error: 'This email is already verified on another account' });

  try {
    await issueOtp(member.member_id, email, 'email_verification');
    res.json({ message: 'A verification code was sent to your email. It expires in 10 minutes.' });
  } catch (error) {
    if (error.statusCode === 429) return res.status(429).json({ error: error.message });
    console.error('Could not send email verification code:', error.message);
    res.status(503).json({ error: 'Could not send the verification email. Check email service setup and try later.' });
  }
});

router.post('/email/verification/confirm', requireAuth, (req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Enter a valid email and six-digit verification code' });
  }

  const challenge = findValidChallenge(req.user.memberId, email, 'email_verification', code);
  if (!challenge) return res.status(400).json({ error: 'Code is invalid, expired, or has reached its attempt limit' });

  const existing = db.prepare(`
    SELECT member_id FROM members
    WHERE lower(email) = ? AND email_verified_at IS NOT NULL AND member_id != ?
  `).get(email, req.user.memberId);
  if (existing) return res.status(409).json({ error: 'This email is already verified on another account' });

  const verifiedAt = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE members SET email = ?, email_verified_at = ? WHERE member_id = ?')
      .run(email, verifiedAt, req.user.memberId);
    db.prepare('UPDATE otp_challenges SET used_at = ? WHERE id = ?')
      .run(Date.now(), challenge.id);
  })();

  res.json({ message: 'Email verified successfully', email, emailVerified: true });
});

router.post('/password-reset/request', async (req, res) => {
  const memberId = typeof req.body.memberId === 'string' ? req.body.memberId.trim() : '';
  if (!memberId || memberId.length > 100) {
    return res.status(400).json({ error: 'Enter your member ID' });
  }
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return res.status(503).json({ error: 'Password reset email is not configured yet. Please contact the club administrator.' });
  }

  const member = db.prepare(`
    SELECT member_id, email FROM members
    WHERE member_id = ? AND email IS NOT NULL AND email_verified_at IS NOT NULL
  `).get(memberId);

  if (member) {
    try {
      await issueOtp(member.member_id, member.email, 'password_reset');
    } catch (error) {
      if (error.statusCode !== 429) {
        console.error('Could not send password reset code:', error.message);
        return res.status(503).json({ error: 'Password reset email could not be sent. Please try again later.' });
      }
    }
  }

  res.json({ message: GENERIC_RESET_RESPONSE });
});

router.post('/password-reset/confirm', (req, res) => {
  const memberId = typeof req.body.memberId === 'string' ? req.body.memberId.trim() : '';
  const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
  const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
  if (!memberId || memberId.length > 100 || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Enter your member ID and six-digit code' });
  }
  if (newPassword.length < 8 || newPassword.length > 128) {
    return res.status(400).json({ error: 'Password must be between 8 and 128 characters' });
  }

  const member = db.prepare(`
    SELECT member_id, email FROM members
    WHERE member_id = ? AND email IS NOT NULL AND email_verified_at IS NOT NULL
  `).get(memberId);
  if (!member) return res.status(400).json({ error: 'Code is invalid, expired, or was already used' });

  const challenge = findValidChallenge(member.member_id, member.email, 'password_reset', code);
  if (!challenge) return res.status(400).json({ error: 'Code is invalid, expired, or has reached its attempt limit' });

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  db.transaction(() => {
    db.prepare('UPDATE members SET password_hash = ? WHERE member_id = ?')
      .run(passwordHash, member.member_id);
    db.prepare('UPDATE otp_challenges SET used_at = ? WHERE id = ?')
      .run(Date.now(), challenge.id);
    db.prepare(`
      UPDATE otp_challenges SET used_at = ?
      WHERE member_id = ? AND purpose = 'password_reset' AND used_at IS NULL
    `).run(Date.now(), member.member_id);
  })();

  res.json({ message: 'Password reset successfully. Sign in with your new password.' });
});

router.post('/login', (req, res) => {
  const { userId, password } = req.body;
  if (!userId || !password) return res.status(400).json({ error: 'User ID and password are required' });

  const member = db.prepare('SELECT * FROM members WHERE member_id = ?').get(userId);
  if (!member || !bcrypt.compareSync(password, member.password_hash)) {
    return res.status(401).json({ error: 'Invalid User ID or password' });
  }

  const token = jwt.sign(
    { memberId: member.member_id, role: member.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: { memberId: member.member_id, memberName: member.name, role: member.role }
  });
});

router.post('/register', (req, res) => {
  const { name, mobile, whatsapp, address, location, bloodGroup } = req.body;
  if (!name || !mobile) return res.status(400).json({ error: 'Name and mobile number are required' });
  if (!location || !db.LOCATIONS.includes(location)) {
    return res.status(400).json({ error: 'Please select a valid location' });
  }
  if (bloodGroup && !db.BLOOD_GROUPS.includes(bloodGroup)) {
    return res.status(400).json({ error: 'Please select a valid blood group' });
  }

  const trimmedMobile = mobile.trim();

  // Check both member_id (the mobile-as-ID scheme) and the mobile column,
  // since members created before this scheme may have a different member_id.
  const existingMember = db.prepare('SELECT member_id FROM members WHERE member_id = ? OR mobile = ?').get(trimmedMobile, trimmedMobile);
  if (existingMember) return res.status(409).json({ error: 'This mobile number is already registered' });

  const existingPending = db.prepare(`
    SELECT id FROM registrations WHERE mobile = ? AND status = 'pending'
  `).get(trimmedMobile);
  if (existingPending) return res.status(409).json({ error: 'This mobile number already has a pending registration' });

  db.prepare(`
    INSERT INTO registrations (name, mobile, whatsapp, address, location, blood_group, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(name.trim(), trimmedMobile, (whatsapp || '').trim(), (address || '').trim(), location, bloodGroup || null);

  res.status(201).json({ message: 'Registration submitted. An admin will review your request.' });
});

router.put('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }

  const member = db.prepare('SELECT * FROM members WHERE member_id = ?').get(req.user.memberId);
  if (!member || !bcrypt.compareSync(currentPassword, member.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE members SET password_hash = ? WHERE member_id = ?').run(passwordHash, member.member_id);

  res.json({ message: 'Password updated successfully' });
});

module.exports = router;
