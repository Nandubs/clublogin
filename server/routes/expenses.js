const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const expenses = db.prepare(`
    SELECT * FROM expenses ORDER BY year DESC, month DESC
  `).all();

  res.json(expenses.map(e => ({
    _id: e.id,
    month: e.month,
    year: e.year,
    electricityBill: e.electricity_bill,
    waterBill: e.water_bill,
    internetBill: e.internet_bill,
    miscellaneous: e.miscellaneous,
    totalExpense: e.total_expense
  })));
});

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { month, year } = req.body;
  const electricityBill = parseFloat(req.body.electricityBill) || 0;
  const waterBill = parseFloat(req.body.waterBill) || 0;
  const internetBill = parseFloat(req.body.internetBill) || 0;
  const miscellaneous = parseFloat(req.body.miscellaneous) || 0;

  if (!month || !year) return res.status(400).json({ error: 'Month and year are required' });

  const totalExpense = electricityBill + waterBill + internetBill + miscellaneous;

  const result = db.prepare(`
    INSERT INTO expenses (month, year, electricity_bill, water_bill, internet_bill, miscellaneous, total_expense)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(month, year, electricityBill, waterBill, internetBill, miscellaneous, totalExpense);

  res.status(201).json({ message: 'Expense added', id: result.lastInsertRowid });
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Expense not found' });
  res.json({ message: 'Expense deleted' });
});

module.exports = router;
