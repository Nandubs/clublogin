const crypto = require('crypto');
const db = require('../db');
const { sendOtpEmail } = require('./email');

const OTP_TTL_MS = 10 * 60 * 1000;
const REQUEST_COOLDOWN_MS = 60 * 1000;
const REQUESTS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashCode(memberId, purpose, email, code) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required for OTP verification');
  return crypto.createHmac('sha256', secret)
    .update(`${memberId}|${purpose}|${email}|${code}`)
    .digest('hex');
}

function getRequestLimit(memberId, purpose, now) {
  const latest = db.prepare(`
    SELECT created_at FROM otp_challenges
    WHERE member_id = ? AND purpose = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(memberId, purpose);
  if (latest && now - latest.created_at < REQUEST_COOLDOWN_MS) {
    return 'Please wait before requesting another code';
  }

  const recent = db.prepare(`
    SELECT COUNT(*) AS count FROM otp_challenges
    WHERE member_id = ? AND purpose = ? AND created_at > ?
  `).get(memberId, purpose, now - 60 * 60 * 1000);
  if (recent.count >= REQUESTS_PER_HOUR) {
    return 'Too many code requests. Try again later';
  }
  return null;
}

async function issueOtp(memberId, email, purpose) {
  const now = Date.now();
  const limitError = getRequestLimit(memberId, purpose, now);
  if (limitError) {
    const error = new Error(limitError);
    error.statusCode = 429;
    throw error;
  }

  const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  const result = db.prepare(`
    INSERT INTO otp_challenges (member_id, purpose, email, code_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(memberId, purpose, email, hashCode(memberId, purpose, email, code), now + OTP_TTL_MS, now);

  try {
    await sendOtpEmail(email, code, purpose);
  } catch (error) {
    db.prepare('DELETE FROM otp_challenges WHERE id = ?').run(result.lastInsertRowid);
    throw error;
  }
}

function findValidChallenge(memberId, email, purpose, code) {
  const challenge = db.prepare(`
    SELECT * FROM otp_challenges
    WHERE member_id = ? AND email = ? AND purpose = ?
      AND used_at IS NULL AND expires_at > ? AND attempts < ?
    ORDER BY created_at DESC LIMIT 1
  `).get(memberId, email, purpose, Date.now(), MAX_ATTEMPTS);

  if (!challenge) return null;
  const expected = hashCode(memberId, purpose, email, code);
  const expectedBuffer = Buffer.from(challenge.code_hash, 'hex');
  const actualBuffer = Buffer.from(expected, 'hex');
  if (expectedBuffer.length === actualBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return challenge;
  }

  db.prepare('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?').run(challenge.id);
  return null;
}

module.exports = {
  findValidChallenge,
  isValidEmail,
  issueOtp,
  normalizeEmail
};
