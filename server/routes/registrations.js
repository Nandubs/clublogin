const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/', (req, res) => {
  const pending = db.prepare(`
    SELECT * FROM registrations WHERE status = 'pending' ORDER BY created_at ASC
  `).all();
  res.json(pending);
});

router.post('/:id/approve', (req, res) => {
  const { memberId, password, role } = req.body;
  if (!memberId || !password) return res.status(400).json({ error: 'Member ID and password are required' });
  if (role && !['member', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const registration = db.prepare(`SELECT * FROM registrations WHERE id = ? AND status = 'pending'`).get(req.params.id);
  if (!registration) return res.status(404).json({ error: 'Registration not found or already processed' });

  const existing = db.prepare('SELECT member_id FROM members WHERE member_id = ?').get(memberId);
  if (existing) return res.status(409).json({ error: 'That Member ID is already in use' });

  const passwordHash = bcrypt.hashSync(password, 10);

  const insertMember = db.prepare(`
    INSERT INTO members (member_id, name, mobile, address, password_hash, role)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const markApproved = db.prepare(`UPDATE registrations SET status = 'approved' WHERE id = ?`);

  db.transaction(() => {
    insertMember.run(memberId, registration.name, registration.mobile, registration.address, passwordHash, role || 'member');
    markApproved.run(registration.id);
  })();

  res.status(201).json({ message: 'Registration approved and member created' });
});

router.post('/:id/reject', (req, res) => {
  const result = db.prepare(`UPDATE registrations SET status = 'rejected' WHERE id = ? AND status = 'pending'`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Registration not found or already processed' });
  res.json({ message: 'Registration rejected' });
});

module.exports = router;
