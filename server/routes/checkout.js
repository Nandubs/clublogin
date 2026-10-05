const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const {
  createOrder,
  fetchPayment,
  getCredentials,
  isValidCheckoutSignature,
  isValidWebhookSignature,
  settleCapturedPayment
} = require('../services/razorpay');

const router = express.Router();
const MAIN_ADMIN = 'brahmastra01';

router.post('/orders', requireAuth, async (req, res) => {
  const { month, year } = req.body;
  if (!Number.isInteger(month) || month < 1 || month > 12 ||
      !Number.isInteger(year) || year < 2000 || year > new Date().getFullYear()) {
    return res.status(400).json({ error: 'A valid due month and year are required' });
  }
  if (req.user.memberId === MAIN_ADMIN) {
    return res.status(403).json({ error: 'The main admin does not pay membership dues' });
  }

  const member = db.prepare('SELECT member_id, name, mobile FROM members WHERE member_id = ?')
    .get(req.user.memberId);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const existing = db.prepare(`
    SELECT amount, status FROM payments WHERE member_id = ? AND month = ? AND year = ?
  `).get(member.member_id, month, year);
  if (existing && existing.status === 'paid') {
    return res.status(409).json({ error: 'This month is already paid' });
  }

  let credentials;
  try {
    credentials = getCredentials();
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }

  const amount = existing && existing.amount ? existing.amount : 100;
  const receipt = `club_${crypto.randomBytes(12).toString('hex')}`;
  try {
    const order = await createOrder(amount * 100, receipt);
    db.prepare(`
      INSERT INTO payment_orders (order_id, member_id, month, year, amount)
      VALUES (?, ?, ?, ?, ?)
    `).run(order.id, member.member_id, month, year, amount);

    res.status(201).json({
      keyId: credentials.keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      memberName: member.name,
      contact: member.mobile || ''
    });
  } catch (error) {
    console.error('Razorpay order creation failed:', error.message);
    res.status(502).json({ error: 'Could not start payment. Please try again later.' });
  }
});

router.post('/verify', requireAuth, async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
  if (!orderId || !paymentId || !signature) {
    return res.status(400).json({ error: 'Razorpay payment details are required' });
  }

  const order = db.prepare('SELECT * FROM payment_orders WHERE order_id = ? AND member_id = ?')
    .get(orderId, req.user.memberId);
  if (!order) return res.status(404).json({ error: 'Payment order not found for this account' });

  let credentials;
  try {
    credentials = getCredentials();
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }
  if (!isValidCheckoutSignature(orderId, paymentId, signature, credentials.keySecret)) {
    return res.status(400).json({ error: 'Payment signature is invalid' });
  }

  try {
    const payment = await fetchPayment(paymentId);
    if (payment.order_id !== orderId ||
        payment.amount !== order.amount * 100 ||
        payment.currency !== 'INR') {
      return res.status(400).json({ error: 'Payment details do not match this membership payment' });
    }
    if (payment.status !== 'captured') {
      return res.status(202).json({ status: 'pending', message: 'Payment is awaiting capture confirmation' });
    }

    settleCapturedPayment(payment);
    return res.json({ status: 'paid', month: order.month, year: order.year });
  } catch (error) {
    console.error('Razorpay payment verification failed:', error.message);
    return res.status(502).json({ error: 'Could not verify payment yet. Refresh payment status shortly.' });
  }
});

router.post('/webhook', (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.get('x-razorpay-signature');
  if (!webhookSecret || !signature || !req.rawBody) {
    return res.status(400).json({ error: 'Webhook verification is not configured' });
  }
  if (!isValidWebhookSignature(req.rawBody, signature, webhookSecret)) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  if (req.body.event !== 'payment.captured') return res.json({ received: true });

  const payment = req.body.payload && req.body.payload.payment && req.body.payload.payment.entity;
  if (!payment || !payment.order_id || payment.status !== 'captured') {
    return res.status(400).json({ error: 'Captured payment details are missing' });
  }

  try {
    settleCapturedPayment(payment);
    return res.json({ received: true });
  } catch (error) {
    console.error('Razorpay webhook settlement failed:', error.message);
    return res.status(400).json({ error: 'Captured payment could not be matched to an order' });
  }
});

module.exports = router;
