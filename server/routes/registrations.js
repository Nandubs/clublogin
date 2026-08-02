const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendSms } = require('../services/sms');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/', (req, res) => {
  const pending = db.prepare(`
    SELECT * FROM registrations WHERE status = 'pending' ORDER BY created_at ASC
  `).all();
  res.json(pending);
});

router.post('/:id/approve', async (req, res) => {
  const { password, role } = req.body;
  if (!password) return res.status(400).json({ error: 'Password is required' });
  if (role && !['member', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const registration = db.prepare(`SELECT * FROM registrations WHERE id = ? AND status = 'pending'`).get(req.params.id);
  if (!registration) return res.status(404).json({ error: 'Registration not found or already processed' });

  // The registrant's mobile number is their login ID. Check both member_id
  // and the mobile column, since members created before this scheme may
  // have a different member_id than their mobile number.
  const memberId = registration.mobile;
  const existing = db.prepare('SELECT member_id FROM members WHERE member_id = ? OR mobile = ?').get(memberId, memberId);
  if (existing) return res.status(409).json({ error: 'This mobile number is already registered as a member' });

  const passwordHash = bcrypt.hashSync(password, 10);

  const insertMember = db.prepare(`
    INSERT INTO members (member_id, name, mobile, whatsapp, address, location, blood_group, password_hash, role)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const markApproved = db.prepare(`UPDATE registrations SET status = 'approved' WHERE id = ?`);

  db.transaction(() => {
    insertMember.run(
      memberId, registration.name, registration.mobile, registration.whatsapp,
      registration.address, registration.location, registration.blood_group, passwordHash, role || 'member'
    );
    markApproved.run(registration.id);
  })();

  const smsMessage = `Welcome to Brahmastra Arts & Sports Club! Your login ID is ${memberId} and password is ${password}. Please log in to the member portal.`;
  let smsSent = false;
  let smsError = null;
  try {
    const result = await sendSms(memberId, smsMessage);
    smsSent = !result.skipped;
  } catch (err) {
    smsError = err.message;
    console.error(`Failed to send approval SMS to ${memberId}:`, err.message);
  }

  res.status(201).json({
    message: 'Registration approved and member created',
    memberId,
    smsSent,
    ...(smsError && { smsError })
  });
});

router.post('/:id/reject', (req, res) => {
  const result = db.prepare(`UPDATE registrations SET status = 'rejected' WHERE id = ? AND status = 'pending'`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Registration not found or already processed' });
  res.json({ message: 'Registration rejected' });
});

module.exports = router;
