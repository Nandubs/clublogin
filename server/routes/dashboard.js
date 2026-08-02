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

  const monthlyCollection = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM payments
    WHERE month = ? AND year = ? AND status = 'paid'
  `).get(month, year).total;

  const monthlyExpenses = db.prepare(`
    SELECT COALESCE(SUM(total_expense), 0) AS total FROM expenses
    WHERE month = ? AND year = ?
  `).get(month, year).total;

  res.json({
    totalMembers,
    monthlyCollection,
    monthlyExpenses,
    netBalance: monthlyCollection - monthlyExpenses
  });
});

module.exports = router;
