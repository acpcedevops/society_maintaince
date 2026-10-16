const crypto = require('crypto');

let Razorpay = null;

// Resolves the Razorpay credentials to use: per-society keys take priority,
// otherwise fall back to the global environment configuration.
function resolveKeys(keys) {
  return {
    keyId: keys?.keyId || process.env.RAZORPAY_KEY_ID || null,
    keySecret: keys?.keySecret || process.env.RAZORPAY_KEY_SECRET || null,
  };
}

function isConfigured(keys) {
  const { keyId, keySecret } = resolveKeys(keys);
  return Boolean(keyId && keySecret);
}

function getClient(keys) {
  const { keyId, keySecret } = resolveKeys(keys);
  if (!keyId || !keySecret) return null;
  if (!Razorpay) {
    Razorpay = require('razorpay');
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

async function createOrder({ amount, receipt, notes, keys }) {
  const client = getClient(keys);
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

function verifySignature({ orderId, paymentId, signature, keys }) {
  const { keySecret } = resolveKeys(keys);
  if (!keySecret) return true;
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return expected === signature;
}

module.exports = { isConfigured, getClient, createOrder, verifySignature, resolveKeys };
