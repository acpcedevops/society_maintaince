const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { protect, adminOnly } = require('../middleware/auth');
const {
  decorateBill,
  getActiveConfig,
  generateBillsForMonth,
} = require('../lib/billing');

const router = express.Router();

const configSchema = z.object({
  name: z.string().min(1),
  amount1bhk: z.union([z.string(), z.number()]),
  amount2bhk: z.union([z.string(), z.number()]),
  lateFeePerDay: z.union([z.string(), z.number()]),
  dueDay: z.union([z.string(), z.number()]),
});

const billInclude = {
  unit: { include: { members: { select: { name: true, phone: true, isOwner: true } } } },
  transactions: true,
};

function serialise(bill, config, now) {
  return decorateBill(bill, config, now);
}

// --- Config (must be before /:id style routes) ---
router.get('/config', protect, async (req, res, next) => {
  try {
    const config = await getActiveConfig(req.user.societyId);
    res.json({ config });
  } catch (err) {
    next(err);
  }
});

router.post('/config', protect, adminOnly, async (req, res, next) => {
  try {
    const data = configSchema.parse(req.body);
    await prisma.maintenanceConfig.updateMany({
      where: { active: true, societyId: req.user.societyId },
      data: { active: false },
    });
    const config = await prisma.maintenanceConfig.create({
      data: {
        societyId: req.user.societyId,
        name: data.name,
        amount1bhk: Number(data.amount1bhk),
        amount2bhk: Number(data.amount2bhk),
        lateFeePerDay: Number(data.lateFeePerDay),
        dueDay: Number(data.dueDay),
        active: true,
      },
    });
    res.json({ config });
  } catch (err) {
    next(err);
  }
});

// --- Generate monthly bills ---
router.post('/generate', protect, adminOnly, async (req, res, next) => {
  try {
    const body = z
      .object({ month: z.union([z.string(), z.number()]), year: z.union([z.string(), z.number()]) })
      .parse(req.body);
    const month = Number(body.month);
    const year = Number(body.year);

    const config = await getActiveConfig(req.user.societyId);
    if (!config) {
      return res.status(400).json({ error: 'No active maintenance configuration found' });
    }

    const { created, skipped } = await generateBillsForMonth(req.user.societyId, month, year, config);

    res.json({ month, year, created, skipped });
  } catch (err) {
    next(err);
  }
});

// --- Monthly view ---
router.get('/month/:month/:year', protect, async (req, res, next) => {
  try {
    const month = Number(req.params.month);
    const year = Number(req.params.year);
    const config = await getActiveConfig(req.user.societyId);
    const now = new Date();

    const where = { month, year, unit: { societyId: req.user.societyId } };
    if (req.user.role !== 'ADMIN' && req.user.unitId) {
      where.unitId = req.user.unitId;
    }

    const bills = await prisma.bill.findMany({
      where,
      include: billInclude,
      orderBy: { unitId: 'asc' },
    });

    res.json({ month, year, bills: bills.map((b) => serialise(b, config, now)) });
  } catch (err) {
    next(err);
  }
});

// --- Offline (cash/cheque/upi) payment recorded by admin ---
router.post('/offline-payment', protect, adminOnly, async (req, res, next) => {
  try {
    const body = z
      .object({
        billId: z.union([z.string(), z.number()]),
        amount: z.union([z.string(), z.number()]),
        method: z.enum(['ONLINE', 'CASH', 'CHEQUE', 'UPI', 'LINK']).optional(),
      })
      .parse(req.body);

    const billId = Number(body.billId);
    const amount = Number(body.amount);
    const method = body.method || 'CASH';

    const bill = await prisma.bill.findFirst({
      where: { id: billId, unit: { societyId: req.user.societyId } },
    });
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    const config = await getActiveConfig(req.user.societyId);
    const total = bill.amount + (decorateBill(bill, config).lateFee || 0);

    await prisma.transaction.create({
      data: { billId, amount, method, status: 'PAID' },
    });

    const agg = await prisma.transaction.aggregate({
      where: { billId, status: 'PAID' },
      _sum: { amount: true },
    });
    const paid = agg._sum.amount || 0;
    const status = paid >= total ? 'PAID' : 'PARTIAL';

    const updated = await prisma.bill.update({
      where: { id: billId },
      data: {
        status,
        paymentMethod: method,
        paidAt: status === 'PAID' ? new Date() : bill.paidAt,
      },
      include: billInclude,
    });

    res.json({ ok: true, bill: serialise(updated, config, new Date()) });
  } catch (err) {
    next(err);
  }
});

// --- List all bills ---
router.get('/', protect, async (req, res, next) => {
  try {
    const config = await getActiveConfig(req.user.societyId);
    const now = new Date();
    const where = { unit: { societyId: req.user.societyId } };
    if (req.user.role !== 'ADMIN' && req.user.unitId) {
      where.unitId = req.user.unitId;
    }
    const bills = await prisma.bill.findMany({
      where,
      include: billInclude,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    res.json({ bills: bills.map((b) => serialise(b, config, now)) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
