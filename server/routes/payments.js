const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendSms } = require('../services/sms');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

router.post('/remind', async (req, res) => {
  const memberId = req.body.memberId;
  const month = parseInt(req.body.month, 10);
  const year = parseInt(req.body.year, 10);
  if (!memberId || !month || !year) {
    return res.status(400).json({ error: 'Member, month and year are required' });
  }

  const member = db.prepare('SELECT member_id, name, mobile FROM members WHERE member_id = ?').get(memberId);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const payment = db.prepare('SELECT amount, status FROM payments WHERE member_id = ? AND month = ? AND year = ?').get(memberId, month, year);
  if (payment && payment.status === 'paid') {
    return res.status(400).json({ error: 'This member has already paid for this month' });
  }
  const amount = (payment && payment.amount) || 100;

  const message = `Dear ${member.name}, your monthly bill of Rs.${amount} for ${MONTH_NAMES[month]} ${year} is pending with Brahmastra Arts & Sports Club. Please pay at your earliest convenience.`;

  let smsSent = false;
  let smsError = null;
  try {
    const result = await sendSms(member.mobile || member.member_id, message);
    smsSent = !result.skipped;
  } catch (err) {
    smsError = err.message;
    console.error(`Failed to send payment reminder SMS to ${memberId}:`, err.message);
  }

  res.json({ message: 'Reminder processed', smsSent, ...(smsError && { smsError }) });
});

module.exports = router;
