const crypto = require('crypto');

const API_VERSION = '2025-01-01';

// Resolves the Cashfree credentials to use: per-society keys take priority,
// otherwise fall back to the global environment configuration.
function resolveKeys(keys) {
  return {
    appId: keys?.appId || process.env.CASHFREE_APP_ID || null,
    secretKey: keys?.secretKey || process.env.CASHFREE_SECRET_KEY || null,
  };
}

function isConfigured(keys) {
  const { appId, secretKey } = resolveKeys(keys);
  return Boolean(appId && secretKey);
}

// "production" | "sandbox" — detected from the secret key, then env, then sandbox.
function getMode(keys) {
  const { secretKey } = resolveKeys(keys);
  if (secretKey && /_prod_/i.test(secretKey)) return 'production';
  if (secretKey && /_(test|sandbox)_/i.test(secretKey)) return 'sandbox';
  const explicit = (process.env.CASHFREE_ENV || '').toLowerCase();
  if (explicit.startsWith('prod')) return 'production';
  if (explicit.startsWith('sand') || explicit.startsWith('test')) return 'sandbox';
  return 'sandbox';
}

function baseUrl(mode) {
  return mode === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
}

async function cashfreeFetch(path, { method = 'GET', body, keys } = {}) {
  const { appId, secretKey } = resolveKeys(keys);
  const mode = getMode(keys);
  const res = await fetch(`${baseUrl(mode)}${path}`, {
    method,
    headers: {
      'x-client-id': appId,
      'x-client-secret': secretKey,
      'x-api-version': API_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    const message = data?.message || data?.error || `Cashfree request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

async function createOrder({ amount, orderId, customer, returnUrl, notifyUrl, note, tags, keys }) {
  if (!isConfigured(keys)) {
    return {
      mock: true,
      mode: getMode(keys),
      order: {
        id: orderId || `mock_order_${Date.now()}`,
        amount,
        currency: 'INR',
        paymentSessionId: null,
        status: 'created',
      },
    };
  }

  const orderMeta = {};
  if (returnUrl) orderMeta.return_url = returnUrl;
  if (notifyUrl) orderMeta.notify_url = notifyUrl;

  const payload = {
    order_id: orderId,
    order_amount: amount,
    order_currency: 'INR',
    customer_details: {
      customer_id: customer?.id ? String(customer.id) : `cust_${Date.now()}`,
      customer_phone: String(customer?.phone || '9999999999'),
      ...(customer?.email ? { customer_email: customer.email } : {}),
      ...(customer?.name ? { customer_name: customer.name } : {}),
    },
    ...(Object.keys(orderMeta).length ? { order_meta: orderMeta } : {}),
    ...(tags ? { order_tags: tags } : {}),
    ...(note ? { order_note: note } : {}),
  };

  const data = await cashfreeFetch('/orders', { method: 'POST', body: payload, keys });
  return {
    mock: false,
    mode: getMode(keys),
    order: {
      id: data.order_id,
      cfOrderId: data.cf_order_id,
      amount: data.order_amount,
      currency: data.order_currency,
      paymentSessionId: data.payment_session_id,
      status: data.order_status,
    },
  };
}

async function fetchOrder(orderId, keys) {
  return cashfreeFetch(`/orders/${encodeURIComponent(orderId)}`, { keys });
}

async function fetchOrderPayments(orderId, keys) {
  return cashfreeFetch(`/orders/${encodeURIComponent(orderId)}/payments`, { keys });
}

function isOrderPaid(order) {
  return String(order?.order_status || '').toUpperCase() === 'PAID';
}

function findSuccessfulPayment(payments) {
  if (!Array.isArray(payments)) return null;
  return (
    payments.find((p) => String(p?.payment_status || '').toUpperCase() === 'SUCCESS') || null
  );
}

function verifyWebhookSignature({ timestamp, rawBody, signature, keys }) {
  const { secretKey } = resolveKeys(keys);
  if (!secretKey || !signature || !timestamp) return false;
  const expected = crypto
    .createHmac('sha256', secretKey)
    .update(`${timestamp}${rawBody}`)
    .digest('base64');
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  isConfigured,
  getMode,
  createOrder,
  fetchOrder,
  fetchOrderPayments,
  isOrderPaid,
  findSuccessfulPayment,
  verifyWebhookSignature,
  resolveKeys,
};

