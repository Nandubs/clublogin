const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const expenses = db.prepare(`
    SELECT * FROM expenses ORDER BY year DESC, month DESC
  `).all();

  const donationsByExpense = db.prepare('SELECT id, expense_id, purpose, amount FROM donations').all();

  res.json(expenses.map(e => ({
    _id: e.id,
    month: e.month,
    year: e.year,
    electricityBill: e.electricity_bill,
    waterBill: e.water_bill,
    internetBill: e.internet_bill,
    rent: e.rent,
    miscellaneous: e.miscellaneous,
    totalExpense: e.total_expense,
    amountFromAbroad: e.amount_from_abroad,
    donations: donationsByExpense
      .filter(d => d.expense_id === e.id)
      .map(d => ({ id: d.id, purpose: d.purpose, amount: d.amount }))
  })));
});

function parseExpensePayload(body) {
  const electricityBill = parseFloat(body.electricityBill) || 0;
  const waterBill = parseFloat(body.waterBill) || 0;
  const internetBill = parseFloat(body.internetBill) || 0;
  const rent = parseFloat(body.rent) || 0;
  const miscellaneous = parseFloat(body.miscellaneous) || 0;
  const amountFromAbroad = parseFloat(body.amountFromAbroad) || 0;
  const donations = Array.isArray(body.donations)
    ? body.donations
        .map(d => ({ purpose: (d.purpose || '').trim(), amount: parseFloat(d.amount) || 0 }))
        .filter(d => d.purpose && d.amount > 0)
    : [];
  const totalExpense = electricityBill + waterBill + internetBill + rent + miscellaneous;

  return { electricityBill, waterBill, internetBill, rent, miscellaneous, amountFromAbroad, donations, totalExpense };
}

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { month, year } = req.body;
  if (!month || !year) return res.status(400).json({ error: 'Month and year are required' });

  const { electricityBill, waterBill, internetBill, rent, miscellaneous, amountFromAbroad, donations, totalExpense } = parseExpensePayload(req.body);

  const insertExpense = db.prepare(`
    INSERT INTO expenses (month, year, electricity_bill, water_bill, internet_bill, rent, miscellaneous, total_expense, amount_from_abroad)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDonation = db.prepare('INSERT INTO donations (expense_id, purpose, amount) VALUES (?, ?, ?)');

  const expenseId = db.transaction(() => {
    const result = insertExpense.run(month, year, electricityBill, waterBill, internetBill, rent, miscellaneous, totalExpense, amountFromAbroad);
    for (const d of donations) {
      insertDonation.run(result.lastInsertRowid, d.purpose, d.amount);
    }
    return result.lastInsertRowid;
  })();

  res.status(201).json({ message: 'Expense added', id: expenseId });
});

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM expenses WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Expense not found' });

  const { month, year } = req.body;
  if (!month || !year) return res.status(400).json({ error: 'Month and year are required' });

  const { electricityBill, waterBill, internetBill, rent, miscellaneous, amountFromAbroad, donations, totalExpense } = parseExpensePayload(req.body);

  const updateExpense = db.prepare(`
    UPDATE expenses SET month = ?, year = ?, electricity_bill = ?, water_bill = ?, internet_bill = ?,
      rent = ?, miscellaneous = ?, total_expense = ?, amount_from_abroad = ?
    WHERE id = ?
  `);
  const deleteDonations = db.prepare('DELETE FROM donations WHERE expense_id = ?');
  const insertDonation = db.prepare('INSERT INTO donations (expense_id, purpose, amount) VALUES (?, ?, ?)');

  db.transaction(() => {
    updateExpense.run(month, year, electricityBill, waterBill, internetBill, rent, miscellaneous, totalExpense, amountFromAbroad, id);
    deleteDonations.run(id);
    for (const d of donations) {
      insertDonation.run(id, d.purpose, d.amount);
    }
  })();

  res.json({ message: 'Expense updated' });
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Expense not found' });
  res.json({ message: 'Expense deleted' });
});

module.exports = router;
