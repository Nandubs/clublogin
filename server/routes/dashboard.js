const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Club-wide financial summary — intentionally open to any logged-in member
// (not just admins) for transparency, not just the main admin dashboard.
router.get('/stats', (req, res) => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const totalMembers = db.prepare('SELECT COUNT(*) AS count FROM members').get().count;

  const monthlyDues = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM payments
    WHERE month = ? AND year = ? AND status = 'paid'
  `).get(month, year).total;

  const monthlyAbroad = db.prepare(`
    SELECT COALESCE(SUM(amount_from_abroad), 0) AS total FROM expenses
    WHERE month = ? AND year = ?
  `).get(month, year).total;

  const monthlyDonations = db.prepare(`
    SELECT COALESCE(SUM(d.amount), 0) AS total FROM donations d
    JOIN expenses e ON e.id = d.expense_id
    WHERE e.month = ? AND e.year = ?
  `).get(month, year).total;

  const monthlyExpenses = db.prepare(`
    SELECT COALESCE(SUM(total_expense), 0) AS total FROM expenses
    WHERE month = ? AND year = ?
  `).get(month, year).total;

  // Total monthly income: member dues + amount received from abroad + other donations.
  const monthlyCollection = monthlyDues + monthlyAbroad + monthlyDonations;

  res.json({
    totalMembers,
    monthlyCollection,
    monthlyExpenses,
    netBalance: monthlyCollection - monthlyExpenses
  });
});

module.exports = router;
