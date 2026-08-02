const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const MAIN_ADMIN = 'brahmastra01';

router.get('/me', requireAuth, (req, res) => {
  const member = db.prepare('SELECT member_id, name, mobile, address, role FROM members WHERE member_id = ?').get(req.user.memberId);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const monthlyPayments = db.prepare(`
    SELECT month, year, amount, status FROM payments
    WHERE member_id = ? ORDER BY year DESC, month DESC
  `).all(req.user.memberId);

  res.json({
    memberId: member.member_id,
    memberName: member.name,
    mobile: member.mobile,
    address: member.address,
    role: member.role,
    monthlyPayments
  });
});

router.get('/', requireAuth, requireAdmin, (req, res) => {
  const members = db.prepare('SELECT member_id, name, mobile, address, role FROM members ORDER BY name ASC').all();
  res.json(members.map(m => ({ memberId: m.member_id, memberName: m.name, mobile: m.mobile, address: m.address, role: m.role })));
});

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { memberId, memberName, password, role } = req.body;
  if (!memberId || !memberName || !password) {
    return res.status(400).json({ error: 'Member ID, name and password are required' });
  }
  if (role && !['member', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const existing = db.prepare('SELECT member_id FROM members WHERE member_id = ?').get(memberId);
  if (existing) return res.status(409).json({ error: 'That Member ID is already in use' });

  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO members (member_id, name, mobile, address, password_hash, role)
    VALUES (?, ?, ?, '', ?, ?)
  `).run(memberId, memberName, passwordHash, role || 'member');

  res.status(201).json({ message: 'Member added' });
});

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const memberId = req.params.id;
  if (memberId === MAIN_ADMIN) return res.status(403).json({ error: 'The main admin account cannot be edited' });

  const member = db.prepare('SELECT * FROM members WHERE member_id = ?').get(memberId);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const { memberName, password, role } = req.body;
  if (!memberName || !memberName.trim()) return res.status(400).json({ error: 'Member name cannot be empty' });
  if (role && !['member', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  if (password && password.trim()) {
    const passwordHash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE members SET name = ?, role = ?, password_hash = ? WHERE member_id = ?')
      .run(memberName.trim(), role || member.role, passwordHash, memberId);
  } else {
    db.prepare('UPDATE members SET name = ?, role = ? WHERE member_id = ?')
      .run(memberName.trim(), role || member.role, memberId);
  }

  res.json({ message: 'Member updated' });
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const memberId = req.params.id;
  if (memberId === MAIN_ADMIN) return res.status(403).json({ error: 'Cannot delete main admin!' });

  const result = db.prepare('DELETE FROM members WHERE member_id = ?').run(memberId);
  if (result.changes === 0) return res.status(404).json({ error: 'Member not found' });

  res.json({ message: 'Member deleted' });
});

module.exports = router;
