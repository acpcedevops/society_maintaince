const crypto = require('crypto');

let Razorpay = null;

function isConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function getClient() {
  if (!isConfigured()) return null;
  if (!Razorpay) {
    Razorpay = require('razorpay');
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

async function createOrder({ amount, receipt, notes }) {
  const client = getClient();
  if (!client) {
    return {
      mock: true,
      order: {
        id: `mock_order_${Date.now()}`,
        amount: amount * 100,
        currency: 'INR',
        receipt,
        status: 'created',
      },
    };
  }
  const order = await client.orders.create({
    amount: amount * 100,
    currency: 'INR',
    receipt,
    notes,
  });
  return { mock: false, order };
}

function verifySignature({ orderId, paymentId, signature }) {
  if (!isConfigured()) return true;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expected === signature;
}

module.exports = { isConfigured, getClient, createOrder, verifySignature };
