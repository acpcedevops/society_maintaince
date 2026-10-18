const express = require('express');
const prisma = require('../lib/prisma');
const payments = require('../services/payments');
const { decorateBill, getActiveConfig } = require('../lib/billing');

const router = express.Router();

function parseBillIds(value) {
  if (!value) return [];
  return String(value)
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);
}

// Per-society Cashfree keys for the bills in this order (falls back to the
// global env credentials when the society has none configured).
async function keysForBills(billIds) {
  if (!billIds.length) return null;
  const bill = await prisma.bill.findFirst({
    where: { id: Number(billIds[0]) },
    include: { unit: { include: { society: { include: { paymentConfig: true } } } } },
  });
  const cfg = bill?.unit?.society?.paymentConfig;
  if (!cfg?.cashfreeAppId || !cfg?.cashfreeSecretKey) return null;
  return { appId: cfg.cashfreeAppId, secretKey: cfg.cashfreeSecretKey };
}

// Cashfree server-to-server webhook. Mounted before the auth guard because the
// caller is Cashfree, not a logged-in user. Authenticity is proven by HMAC.
router.post('/cashfree', async (req, res) => {
  try {
    const signature = req.get('x-webhook-signature');
    const timestamp = req.get('x-webhook-timestamp');
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});

    const event = req.body || {};
    const order = event?.data?.order || {};
    const payment = event?.data?.payment || {};
    const orderId = order.order_id;

    const tagIds = parseBillIds(order.order_tags?.bill_ids);
    const billIds = tagIds.length ? tagIds : parseBillIds(order.order_note);

    const keys = await keysForBills(billIds);
    const valid = payments.verifyWebhookSignature({ timestamp, rawBody, signature, keys });
    if (!valid) {
      console.warn('[cashfree] webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const status = String(order.order_status || payment.payment_status || '').toUpperCase();
    if (!orderId || (status !== 'PAID' && status !== 'SUCCESS')) {
      return res.json({ ok: true, ignored: true });
    }
    if (!billIds.length) return res.json({ ok: true, ignored: true });

    const cfPaymentId = payment.cf_payment_id || null;

    for (const billId of billIds) {
      const bill = await prisma.bill.findUnique({
        where: { id: Number(billId) },
        include: { unit: { select: { societyId: true } } },
      });
      if (!bill || bill.status === 'PAID') continue;

      const config = await getActiveConfig(bill.unit.societyId);
      const decorated = decorateBill(bill, config);

      await prisma.transaction.create({
        data: {
          billId: bill.id,
          amount: decorated.totalAmount,
          method: 'ONLINE',
          gatewayOrderId: orderId,
          gatewayPaymentId: cfPaymentId,
          status: 'PAID',
        },
      });
      await prisma.bill.update({
        where: { id: bill.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paymentMethod: 'ONLINE',
          gatewayPaymentId: cfPaymentId || bill.gatewayPaymentId,
        },
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[cashfree] webhook error:', err.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
