const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

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
