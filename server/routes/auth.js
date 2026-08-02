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
  const { name, mobile, address } = req.body;
  if (!name || !mobile) return res.status(400).json({ error: 'Name and mobile number are required' });

  db.prepare(`
    INSERT INTO registrations (name, mobile, address, status)
    VALUES (?, ?, ?, 'pending')
  `).run(name.trim(), mobile.trim(), (address || '').trim());

  res.status(201).json({ message: 'Registration submitted. An admin will review your request.' });
});

module.exports = router;
