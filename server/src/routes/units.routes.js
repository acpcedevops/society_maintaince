const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { protect, adminOnly } = require('../middleware/auth');
const { decorateBill, getActiveConfig } = require('../lib/billing');

const router = express.Router();

const unitSchema = z.object({
  unitNo: z.string().min(1),
  floor: z.union([z.string(), z.number()]).optional(),
  bhk: z.string().optional(),
  sqft: z.union([z.string(), z.number()]).optional().nullable(),
  amountOverride: z.union([z.string(), z.number()]).optional().nullable(),
  ownerName: z.string().optional().nullable(),
  occupants: z.union([z.string(), z.number()]).optional(),
});

function toInt(v, fallback = 0) {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

router.get('/summary', protect, adminOnly, async (req, res, next) => {
  try {
    const config = await getActiveConfig(req.user.societyId);
    const now = new Date();
    const units = await prisma.unit.findMany({
      where: { societyId: req.user.societyId },
      include: { members: true, bills: { include: { transactions: true } } },
      orderBy: { unitNo: 'asc' },
    });

    const result = units.map((u) => {
      let totalPaid = 0;
      let totalPending = 0;
      let totalLateFee = 0;
      let paidCount = 0;
      let pendingCount = 0;

      for (const bill of u.bills) {
        const decorated = decorateBill(bill, config, now);
        if (bill.status === 'PAID') {
          paidCount += 1;
          totalPaid += decorated.totalAmount;
        } else {
          pendingCount += 1;
          totalPending += decorated.totalAmount;
          totalLateFee += decorated.lateFee;
        }
      }

      return {
        id: u.id,
        unitNo: u.unitNo,
        floor: u.floor,
        bhk: u.bhk,
        ownerName: u.ownerName,
        amountOverride: u.amountOverride,
        members: u.members.map((m) => ({
          id: m.id,
          name: m.name,
          phone: m.phone,
          email: m.email,
          isOwner: m.isOwner,
        })),
        totalPaid,
        totalPending,
        totalLateFee,
        paidCount,
        pendingCount,
        totalBills: u.bills.length,
      };
    });

    res.json({ units: result });
  } catch (err) {
    next(err);
  }
});

router.get('/', protect, adminOnly, async (req, res, next) => {
  try {
    const units = await prisma.unit.findMany({
      where: { societyId: req.user.societyId },
      include: {
        members: { select: { id: true, name: true, phone: true, isOwner: true } },
        _count: { select: { bills: true } },
      },
      orderBy: { unitNo: 'asc' },
    });
    res.json({ units });
  } catch (err) {
    next(err);
  }
});

router.post('/', protect, adminOnly, async (req, res, next) => {
  try {
    const data = unitSchema.parse(req.body);
    const unit = await prisma.unit.create({
      data: {
        societyId: req.user.societyId,
        unitNo: data.unitNo,
        floor: toInt(data.floor, 0),
        bhk: data.bhk || '1BHK',
        sqft: data.sqft === '' || data.sqft == null ? null : toInt(data.sqft),
        amountOverride:
          data.amountOverride === '' || data.amountOverride == null ? null : toInt(data.amountOverride),
        ownerName: data.ownerName || null,
        occupants: toInt(data.occupants, 0),
      },
    });
    res.status(201).json({ unit });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.unit.findFirst({ where: { id, societyId: req.user.societyId } });
    if (!existing) return res.status(404).json({ error: 'Unit not found' });
    const data = unitSchema.partial().parse(req.body);
    const unit = await prisma.unit.update({
      where: { id },
      data: {
        ...(data.unitNo !== undefined ? { unitNo: data.unitNo } : {}),
        ...(data.floor !== undefined ? { floor: toInt(data.floor, 0) } : {}),
        ...(data.bhk !== undefined ? { bhk: data.bhk } : {}),
        ...(data.sqft !== undefined ? { sqft: data.sqft === '' || data.sqft == null ? null : toInt(data.sqft) } : {}),
        ...(data.amountOverride !== undefined
          ? { amountOverride: data.amountOverride === '' || data.amountOverride == null ? null : toInt(data.amountOverride) }
          : {}),
        ...(data.ownerName !== undefined ? { ownerName: data.ownerName || null } : {}),
        ...(data.occupants !== undefined ? { occupants: toInt(data.occupants, 0) } : {}),
      },
    });
    res.json({ unit });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.unit.findFirst({ where: { id, societyId: req.user.societyId } });
    if (!existing) return res.status(404).json({ error: 'Unit not found' });
    await prisma.unit.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
