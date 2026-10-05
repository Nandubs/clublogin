const crypto = require('crypto');
const db = require('../db');

const API_BASE_URL = 'https://api.razorpay.com/v1';

function getCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }
  return { keyId, keySecret };
}

async function razorpayRequest(path, options = {}) {
  const { keyId, keySecret } = getCredentials();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    },
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error && body.error.description
      ? body.error.description
      : `Razorpay returned HTTP ${response.status}`);
  }
  return body;
}

function createOrder(amount, receipt) {
  return razorpayRequest('/orders', {
    method: 'POST',
    body: JSON.stringify({ amount, currency: 'INR', receipt })
  });
}

function fetchPayment(paymentId) {
  return razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
}

function isValidSignature(expected, provided) {
  if (typeof provided !== 'string' || !/^[a-f0-9]{64}$/i.test(provided)) return false;
  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(provided, 'hex');
  return expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function isValidCheckoutSignature(orderId, paymentId, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return isValidSignature(expected, signature);
}

function isValidWebhookSignature(rawBody, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return isValidSignature(expected, signature);
}

function settleCapturedPayment(payment) {
  if (!payment.order_id || !payment.id || payment.status !== 'captured') {
    throw new Error('Payment is not captured');
  }

  const order = db.prepare('SELECT * FROM payment_orders WHERE order_id = ?').get(payment.order_id);
  if (!order) throw new Error('Payment order not found');
  if (payment.amount !== order.amount * 100 || payment.currency !== 'INR') {
    throw new Error('Captured payment amount does not match the order');
  }

  const paidAt = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`
      INSERT INTO payments (member_id, month, year, amount, status, paid_at)
      VALUES (?, ?, ?, ?, 'paid', ?)
      ON CONFLICT(member_id, month, year) DO UPDATE SET
        amount = excluded.amount,
        status = 'paid',
        paid_at = excluded.paid_at
    `).run(order.member_id, order.month, order.year, order.amount, paidAt);
    db.prepare(`
      UPDATE payment_orders
      SET status = 'paid', payment_id = ?, paid_at = ?
      WHERE order_id = ?
    `).run(payment.id, paidAt, order.order_id);
  })();

  return order;
}

module.exports = {
  createOrder,
  fetchPayment,
  getCredentials,
  isValidCheckoutSignature,
  isValidWebhookSignature,
  settleCapturedPayment
};
