const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/', (req, res) => {
  const month = parseInt(req.query.month, 10);
  const year = parseInt(req.query.year, 10);
  if (!month || !year) return res.status(400).json({ error: 'Month and year are required' });

  const rows = db.prepare(`
    SELECT m.member_id, m.name, p.amount, p.status
    FROM members m
    LEFT JOIN payments p ON p.member_id = m.member_id AND p.month = ? AND p.year = ?
    ORDER BY m.name ASC
  `).all(month, year);

  res.json(rows.map(r => ({
    memberId: r.member_id,
    memberName: r.name,
    amount: r.amount || 100,
    status: r.status || 'not_paid'
  })));
});

router.post('/', (req, res) => {
  const { month, year, payments } = req.body;
  if (!month || !year || !Array.isArray(payments)) {
    return res.status(400).json({ error: 'Month, year and payments are required' });
  }

  const upsert = db.prepare(`
    INSERT INTO payments (member_id, month, year, amount, status, paid_at)
    VALUES (@memberId, @month, @year, @amount, @status, @paidAt)
    ON CONFLICT(member_id, month, year) DO UPDATE SET
      status = excluded.status,
      amount = excluded.amount,
      paid_at = excluded.paid_at
  `);

  db.transaction(() => {
    for (const p of payments) {
      upsert.run({
        memberId: p.memberId,
        month,
        year,
        amount: p.amount || 100,
        status: p.status === 'paid' ? 'paid' : 'not_paid',
        paidAt: p.status === 'paid' ? new Date().toISOString() : null
      });
    }
  })();

  res.json({ message: 'Payments saved' });
});

module.exports = router;
