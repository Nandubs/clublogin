const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

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
  const { name, mobile, whatsapp, address, location } = req.body;
  if (!name || !mobile) return res.status(400).json({ error: 'Name and mobile number are required' });
  if (!location || !db.LOCATIONS.includes(location)) {
    return res.status(400).json({ error: 'Please select a valid location' });
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
    INSERT INTO registrations (name, mobile, whatsapp, address, location, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(name.trim(), trimmedMobile, (whatsapp || '').trim(), (address || '').trim(), location);

  res.status(201).json({ message: 'Registration submitted. An admin will review your request.' });
});

module.exports = router;
