const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { protect } = require('../middleware/auth');
const { decorateBill, getActiveConfig } = require('../lib/billing');
const payments = require('../services/payments');

const router = express.Router();

async function getSocietyKeys(societyId) {
  const config = await prisma.societyPaymentConfig.findUnique({ where: { societyId } });
  return {
    appId: config?.cashfreeAppId || null,
    secretKey: config?.cashfreeSecretKey || null,
  };
}

function publicBase(req) {
  return (
    process.env.PUBLIC_API_URL ||
    process.env.APP_BASE_URL ||
    `${req.protocol}://${req.get('host')}`
  );
}

function newOrderId() {
  return `MB${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

function parseBillIds(value) {
  if (!value) return [];
  return String(value)
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);
}

// Per-society payment details shown to members (never exposes the secret).
router.get('/society-config', protect, async (req, res, next) => {
  try {
    const config = await prisma.societyPaymentConfig.findUnique({
      where: { societyId: req.user.societyId },
    });
    const keys = await getSocietyKeys(req.user.societyId);
    res.json({
      config: {
        upiId: config?.upiId || null,
        payeeName: config?.payeeName || null,
        bankName: config?.bankName || null,
        bankAccountName: config?.bankAccountName || null,
        bankAccountNumber: config?.bankAccountNumber || null,
        bankIfsc: config?.bankIfsc || null,
        qrImagePath: config?.qrImagePath || null,
        hasCashfree: payments.isConfigured(keys),
      },
    });
  } catch (err) {
    next(err);
  }
});

function ensureBillAccess(bill, user) {
  if (!bill) return false;
  if (user.role === 'ADMIN') return true;
  return bill.unitId === user.unitId;
}

async function findBillInSociety(billId, user) {
  return prisma.bill.findFirst({
    where: { id: Number(billId), unit: { societyId: user.societyId } },
  });
}

async function markPaid(
  billId,
  user,
  { method = 'ONLINE', gatewayPaymentId = null, gatewayOrderId = null } = {}
) {
  const bill = await findBillInSociety(billId, user);
  if (!bill) {
    const err = new Error('Bill not found');
    err.status = 404;
    throw err;
  }
  if (!ensureBillAccess(bill, user)) {
    const err = new Error('Not allowed to pay this bill');
    err.status = 403;
    throw err;
  }
  if (bill.status === 'PAID') return bill;

  const config = await getActiveConfig(user.societyId);
  const total = bill.amount + (decorateBill(bill, config).lateFee || 0);

  await prisma.transaction.create({
    data: { billId, amount: total, method, gatewayOrderId, gatewayPaymentId, status: 'PAID' },
  });

  return prisma.bill.update({
    where: { id: billId },
    data: {
      status: 'PAID',
      paidAt: new Date(),
      paymentMethod: method,
      gatewayPaymentId: gatewayPaymentId || bill.gatewayPaymentId,
    },
  });
}

router.post('/create-order', protect, async (req, res, next) => {
  try {
    const { billId } = z.object({ billId: z.union([z.string(), z.number()]) }).parse(req.body);
    const bill = await findBillInSociety(billId, req.user);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    if (!ensureBillAccess(bill, req.user)) {
      return res.status(403).json({ error: 'Not allowed to pay this bill' });
    }

    const config = await getActiveConfig(req.user.societyId);
    const total = bill.amount + (decorateBill(bill, config).lateFee || 0);
    const keys = await getSocietyKeys(req.user.societyId);
    const base = publicBase(req);

    const result = await payments.createOrder({
      amount: total,
      orderId: newOrderId(),
      customer: {
        id: req.user.id,
        name: req.user.name,
        phone: req.user.phone,
        email: req.user.email,
      },
      returnUrl: `${process.env.APP_BASE_URL || base}/bills`,
      notifyUrl: `${base}/api/payments/webhook/cashfree`,
      note: `bills:${bill.id}`,
      tags: { bill_ids: String(bill.id) },
      keys,
    });

    res.json({ mock: result.mock, mode: result.mode, order: result.order, amount: total });
  } catch (err) {
    next(err);
  }
});

router.post('/create-bulk-order', protect, async (req, res, next) => {
  try {
    const { billIds } = z
      .object({ billIds: z.array(z.union([z.string(), z.number()])).min(1) })
      .parse(req.body);

    const ids = [];
    let total = 0;
    const config = await getActiveConfig(req.user.societyId);
    for (const rawId of billIds) {
      const bill = await findBillInSociety(rawId, req.user);
      if (!bill) return res.status(404).json({ error: `Bill ${rawId} not found` });
      if (!ensureBillAccess(bill, req.user)) {
        return res.status(403).json({ error: 'Not allowed to pay this bill' });
      }
      if (bill.status === 'PAID') continue;
      total += bill.amount + (decorateBill(bill, config).lateFee || 0);
      ids.push(bill.id);
    }
    if (ids.length === 0) return res.status(400).json({ error: 'No payable bills selected' });

    const keys = await getSocietyKeys(req.user.societyId);
    const base = publicBase(req);

    const result = await payments.createOrder({
      amount: total,
      orderId: newOrderId(),
      customer: {
        id: req.user.id,
        name: req.user.name,
        phone: req.user.phone,
        email: req.user.email,
      },
      returnUrl: `${process.env.APP_BASE_URL || base}/bills`,
      notifyUrl: `${base}/api/payments/webhook/cashfree`,
      note: `bills:${ids.join(',')}`,
      tags: { bill_ids: ids.join(',') },
      keys,
    });

    res.json({ mock: result.mock, mode: result.mode, order: result.order, amount: total });
  } catch (err) {
    next(err);
  }
});

async function resolveOrderBillIds(order, keys) {
  const fromTags = parseBillIds(order?.order_tags?.bill_ids);
  if (fromTags.length) return fromTags;
  return parseBillIds(order?.order_note);
}

async function settleOrder(orderId, user) {
  const keys = await getSocietyKeys(user.societyId);
  const order = await payments.fetchOrder(orderId, keys);
  if (!payments.isOrderPaid(order)) {
    const err = new Error('Payment not completed for this order');
    err.status = 400;
    throw err;
  }

  const billIds = await resolveOrderBillIds(order, keys);
  if (billIds.length === 0) {
    const err = new Error('Could not determine bills for this payment');
    err.status = 400;
    throw err;
  }

  let paymentId = null;
  try {
    const pays = await payments.fetchOrderPayments(orderId, keys);
    paymentId = payments.findSuccessfulPayment(pays)?.cf_payment_id || null;
  } catch {
    // Non-fatal: the order is already confirmed PAID.
  }

  const paid = [];
  for (const id of billIds) {
    const bill = await markPaid(id, user, {
      method: 'ONLINE',
      gatewayPaymentId: paymentId,
      gatewayOrderId: orderId,
    });
    paid.push(bill.id);
  }
  return paid;
}

router.post('/verify', protect, async (req, res, next) => {
  try {
    const { order_id } = z.object({ order_id: z.string().min(1) }).parse(req.body);
    const paid = await settleOrder(order_id, req.user);
    res.json({ ok: true, status: 'PAID', billId: paid[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-bulk', protect, async (req, res, next) => {
  try {
    const { order_id } = z.object({ order_id: z.string().min(1) }).parse(req.body);
    const paid = await settleOrder(order_id, req.user);
    res.json({ ok: true, paid });
  } catch (err) {
    next(err);
  }
});

router.post('/mock', protect, async (req, res, next) => {
  try {
    const { billId } = z.object({ billId: z.union([z.string(), z.number()]) }).parse(req.body);
    const bill = await markPaid(Number(billId), req.user, { method: 'ONLINE' });
    res.json({ ok: true, status: bill.status, billId: bill.id, demo: true });
  } catch (err) {
    next(err);
  }
});

router.post('/mock-bulk', protect, async (req, res, next) => {
  try {
    const { billIds } = z
      .object({ billIds: z.array(z.union([z.string(), z.number()])).min(1) })
      .parse(req.body);
    const paid = [];
    for (const id of billIds) {
      const bill = await markPaid(Number(id), req.user, { method: 'ONLINE' });
      paid.push(bill.id);
    }
    res.json({ ok: true, paid, demo: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
