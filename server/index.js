require('dotenv').config();
const path = require('path');
const express = require('express');

const db = require('./db');

const authRoutes = require('./routes/auth');
const registrationRoutes = require('./routes/registrations');
const memberRoutes = require('./routes/members');
const paymentRoutes = require('./routes/payments');
const expenseRoutes = require('./routes/expenses');
const dashboardRoutes = require('./routes/dashboard');
const gameRoutes = require('./routes/game');

async function start() {
  await db.ready;

  const app = express();
  app.use(express.json());

  app.use('/api/auth', authRoutes);
  app.use('/api/registrations', registrationRoutes);
  app.use('/api/members', memberRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/game', gameRoutes);

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Brahmastra Club server running on http://localhost:${PORT}`);
  });
}

start();
