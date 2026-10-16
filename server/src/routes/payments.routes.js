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
    keyId: config?.razorpayKeyId || null,
    keySecret: config?.razorpayKeySecret || null,
  };
}

// Per-society payment details shown to members (never exposes the secret).
router.get('/society-config', protect, async (req, res, next) => {
  try {
    const config = await prisma.societyPaymentConfig.findUnique({
      where: { societyId: req.user.societyId },
    });
    const { keyId } = payments.resolveKeys(await getSocietyKeys(req.user.societyId));
    res.json({
      config: {
        upiId: config?.upiId || null,
        payeeName: config?.payeeName || null,
        bankName: config?.bankName || null,
        bankAccountName: config?.bankAccountName || null,
        bankAccountNumber: config?.bankAccountNumber || null,
        bankIfsc: config?.bankIfsc || null,
        qrImagePath: config?.qrImagePath || null,
        razorpayKeyId: keyId,
        hasRazorpay: Boolean(keyId),
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

async function markPaid(billId, user, { method = 'ONLINE', razorpayPaymentId = null } = {}) {
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
    data: { billId, amount: total, method, razorpayPaymentId, status: 'PAID' },
  });

  return prisma.bill.update({
    where: { id: billId },
    data: {
      status: 'PAID',
      paymentMethod: method,
      paidAt: new Date(),
      razorpayPaymentId: razorpayPaymentId || bill.razorpayPaymentId,
    },
  });
}

router.post('/create-order', protect, async (req, res, next) => {
  try {
    const { billId } = z.object({ billId: z.union([z.string(), z.number()]) }).parse(req.body);
    const bill = await findBillInSociety(billId, req.user);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    if (!ensureBillAccess(bill, req.user)) return res.status(403).json({ error: 'Not allowed' });

    const config = await getActiveConfig(req.user.societyId);
    const total = bill.amount + (decorateBill(bill, config).lateFee || 0);
    const keys = await getSocietyKeys(req.user.societyId);
    const result = await payments.createOrder({
      amount: total,
      receipt: `bill_${bill.id}`,
      notes: { billId: String(bill.id) },
      keys,
    });
    const { keyId } = payments.resolveKeys(keys);
    res.json({
      keyId,
      mock: result.mock,
      order: result.order,
      amount: total,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/create-bulk-order', protect, async (req, res, next) => {
  try {
    const { billIds } = z
      .object({ billIds: z.array(z.union([z.string(), z.number()])).min(1) })
      .parse(req.body);
    const ids = billIds.map(Number);
    const bills = await prisma.bill.findMany({
      where: { id: { in: ids }, unit: { societyId: req.user.societyId } },
    });
    if (bills.length !== ids.length || bills.some((b) => !ensureBillAccess(b, req.user))) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    const config = await getActiveConfig(req.user.societyId);
    const total = bills
      .filter((b) => b.status !== 'PAID')
      .reduce((sum, b) => sum + b.amount + (decorateBill(b, config).lateFee || 0), 0);

    const keys = await getSocietyKeys(req.user.societyId);
    const result = await payments.createOrder({
      amount: total,
      receipt: `bulk_${Date.now()}`,
      notes: { billIds: ids.join(',') },
      keys,
    });
    const { keyId } = payments.resolveKeys(keys);
    res.json({ keyId, mock: result.mock, order: result.order, amount: total });
  } catch (err) {
    next(err);
  }
});

router.post('/verify', protect, async (req, res, next) => {
  try {
    const body = z
      .object({
        billId: z.union([z.string(), z.number()]),
        razorpay_order_id: z.string().optional(),
        razorpay_payment_id: z.string().optional(),
        razorpay_signature: z.string().optional(),
      })
      .parse(req.body);

    const valid = payments.verifySignature({
      orderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
      signature: body.razorpay_signature,
      keys: await getSocietyKeys(req.user.societyId),
    });
    if (!valid) return res.status(400).json({ error: 'Payment signature verification failed' });

    const bill = await markPaid(Number(body.billId), req.user, {
      method: 'ONLINE',
      razorpayPaymentId: body.razorpay_payment_id || null,
    });
    res.json({ ok: true, status: bill.status, billId: bill.id });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-bulk', protect, async (req, res, next) => {
  try {
    const body = z
      .object({
        billIds: z.array(z.union([z.string(), z.number()])).min(1),
        razorpay_order_id: z.string().optional(),
        razorpay_payment_id: z.string().optional(),
        razorpay_signature: z.string().optional(),
      })
      .parse(req.body);

    const valid = payments.verifySignature({
      orderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
      signature: body.razorpay_signature,
      keys: await getSocietyKeys(req.user.societyId),
    });
    if (!valid) return res.status(400).json({ error: 'Payment signature verification failed' });

    const paid = [];
    for (const id of body.billIds) {
      const bill = await markPaid(Number(id), req.user, {
        method: 'ONLINE',
        razorpayPaymentId: body.razorpay_payment_id || null,
      });
      paid.push(bill.id);
    }
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
