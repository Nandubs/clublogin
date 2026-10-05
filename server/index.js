require('dotenv').config();
const path = require('path');
const express = require('express');

const db = require('./db');

const authRoutes = require('./routes/auth');
const checkoutRoutes = require('./routes/checkout');
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

  const allowedOrigins = new Set(
    (process.env.CORS_ORIGINS || 'https://localhost,https://brahmastravakkom.in,https://www.brahmastravakkom.in')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
  );
  app.use((req, res, next) => {
    const origin = req.get('Origin');
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/checkout', checkoutRoutes);
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
