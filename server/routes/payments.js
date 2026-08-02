const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendSms } = require('../services/sms');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MAIN_ADMIN = 'brahmastra01';

router.get('/', (req, res) => {
  const month = parseInt(req.query.month, 10);
  const year = parseInt(req.query.year, 10);
  if (!month || !year) return res.status(400).json({ error: 'Month and year are required' });

  const rows = db.prepare(`
    SELECT m.member_id, m.name, p.amount, p.status, p.reminded_at
    FROM members m
    LEFT JOIN payments p ON p.member_id = m.member_id AND p.month = ? AND p.year = ?
    WHERE m.member_id != ?
    ORDER BY m.name ASC
  `).all(month, year, MAIN_ADMIN);

  res.json(rows.map(r => ({
    memberId: r.member_id,
    memberName: r.name,
    amount: r.amount || 100,
    status: r.status || 'not_paid',
    reminded: !!r.reminded_at
  })));
});

router.put('/:memberId', (req, res) => {
  const { memberId } = req.params;
  const month = parseInt(req.body.month, 10);
  const year = parseInt(req.body.year, 10);
  const status = req.body.status === 'paid' ? 'paid' : 'not_paid';
  if (!month || !year) return res.status(400).json({ error: 'Month and year are required' });
  if (memberId === MAIN_ADMIN) return res.status(400).json({ error: 'The main admin does not pay membership dues' });

  const member = db.prepare('SELECT member_id FROM members WHERE member_id = ?').get(memberId);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const existing = db.prepare('SELECT amount FROM payments WHERE member_id = ? AND month = ? AND year = ?').get(memberId, month, year);
  const amount = (existing && existing.amount) || 100;

  db.prepare(`
    INSERT INTO payments (member_id, month, year, amount, status, paid_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(member_id, month, year) DO UPDATE SET
      status = excluded.status,
      paid_at = excluded.paid_at
  `).run(memberId, month, year, amount, status, status === 'paid' ? new Date().toISOString() : null);

  res.json({ memberId, month, year, amount, status });
});

router.post('/remind', async (req, res) => {
  const memberId = req.body.memberId;
  const month = parseInt(req.body.month, 10);
  const year = parseInt(req.body.year, 10);
  if (!memberId || !month || !year) {
    return res.status(400).json({ error: 'Member, month and year are required' });
  }
  if (memberId === MAIN_ADMIN) return res.status(400).json({ error: 'The main admin does not pay membership dues' });

  const member = db.prepare('SELECT member_id, name, mobile FROM members WHERE member_id = ?').get(memberId);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const payment = db.prepare('SELECT amount, status, reminded_at FROM payments WHERE member_id = ? AND month = ? AND year = ?').get(memberId, month, year);
  if (payment && payment.status === 'paid') {
    return res.status(400).json({ error: 'This member has already paid for this month' });
  }
  if (payment && payment.reminded_at) {
    return res.status(400).json({ error: 'A reminder was already sent to this member this month' });
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

  let reminded = false;
  if (smsSent) {
    db.prepare(`
      INSERT INTO payments (member_id, month, year, amount, status, reminded_at)
      VALUES (?, ?, ?, ?, 'not_paid', ?)
      ON CONFLICT(member_id, month, year) DO UPDATE SET reminded_at = excluded.reminded_at
    `).run(memberId, month, year, amount, new Date().toISOString());
    reminded = true;
  }

  res.json({ message: 'Reminder processed', smsSent, reminded, ...(smsError && { smsError }) });
});

module.exports = router;
