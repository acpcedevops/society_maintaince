const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { protect, adminOnly } = require('../middleware/auth');
const { decorateBill, getActiveConfig } = require('../lib/billing');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /image\/(jpeg|png|jpg|webp)|application\/pdf/.test(file.mimetype);
    cb(ok ? null : new Error('Only image or PDF receipts are allowed'), ok);
  },
});

const claimInclude = {
  unit: { select: { id: true, unitNo: true } },
  member: { select: { id: true, name: true, phone: true } },
  category: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  allocations: {
    include: { bill: { select: { id: true, month: true, year: true, amount: true, lateFee: true, status: true } } },
    orderBy: { id: 'asc' },
  },
};

const allocationSchema = z.array(
  z.object({
    billId: z.union([z.string(), z.number()]),
    amount: z.union([z.string(), z.number()]),
  })
);

function serialise(claim) {
  const creditedAmount = (claim.allocations || []).reduce((s, a) => s + a.amount, 0);
  return { ...claim, creditedAmount };
}

// Unit bills decorated with late fee + how much is already paid, so the admin
// can only credit against genuinely outstanding dues.
async function billsWithOutstanding(societyId, unitId) {
  const config = await getActiveConfig(societyId);
  const bills = await prisma.bill.findMany({ where: { unitId, unit: { societyId } } });
  const agg = await prisma.transaction.groupBy({
    by: ['billId'],
    where: { billId: { in: bills.map((b) => b.id) }, status: 'PAID' },
    _sum: { amount: true },
  });
  const paidMap = Object.fromEntries(agg.map((g) => [g.billId, g._sum.amount || 0]));
  return bills
    .map((b) => {
      const decorated = decorateBill(b, config);
      const paid = paidMap[b.id] || 0;
      return { ...decorated, paid, outstanding: Math.max(0, decorated.totalAmount - paid) };
    })
    .sort((a, b) => b.year - a.year || b.month - a.month);
}

// Validate + write allocations (Transaction rows against the claim's unit
// bills) inside one transaction and flip the claim when fully credited.
async function applyAllocations(claim, rawAllocations, societyId, actorId) {
  const allocations = rawAllocations.map((a) => ({ billId: Number(a.billId), amount: Math.round(Number(a.amount)) }));
  if (allocations.length === 0) return { error: 'No allocations provided' };
  if (allocations.some((a) => !(Number.isInteger(a.billId) && a.billId > 0 && a.amount > 0))) {
    return { error: 'Each allocation needs a bill and a positive amount' };
  }

  const bills = await billsWithOutstanding(societyId, claim.unitId);
  const billMap = Object.fromEntries(bills.map((b) => [b.id, b]));
  for (const a of allocations) {
    const bill = billMap[a.billId];
    if (!bill) return { error: `Bill ${a.billId} does not belong to this unit` };
    if (bill.outstanding <= 0) return { error: 'A selected bill has no outstanding dues' };
    if (a.amount > bill.outstanding) {
      return { error: `Credit of Rs. ${a.amount} exceeds outstanding Rs. ${bill.outstanding} on that bill` };
    }
  }

  const alreadyCredited = await prisma.reimbursementAllocation.aggregate({
    where: { reimbursementId: claim.id },
    _sum: { amount: true },
  });
  const total = allocations.reduce((s, a) => s + a.amount, 0);
  const available = (claim.approvedAmount || 0) - (alreadyCredited._sum.amount || 0);
  if (total > available) {
    return { error: `Only Rs. ${available} of this claim is left to credit` };
  }

  const config = await getActiveConfig(societyId);
  const status = await prisma.$transaction(async (tx) => {
    for (const a of allocations) {
      const bill = await tx.bill.findFirst({ where: { id: a.billId, unitId: claim.unitId } });
      const decorated = decorateBill(bill, config);
      const agg = await tx.transaction.aggregate({ where: { billId: bill.id, status: 'PAID' }, _sum: { amount: true } });
      const paidAfter = (agg._sum.amount || 0) + a.amount;
      const billStatus = paidAfter >= decorated.totalAmount ? 'PAID' : 'PARTIAL';

      await tx.transaction.create({
        data: { billId: bill.id, amount: a.amount, method: 'REIMBURSEMENT', status: 'PAID' },
      });
      await tx.bill.update({
        where: { id: bill.id },
        data: {
          status: billStatus,
          paymentMethod: 'REIMBURSEMENT',
          paidAt: billStatus === 'PAID' ? new Date() : bill.paidAt,
        },
      });
      await tx.reimbursementAllocation.create({
        data: { reimbursementId: claim.id, billId: bill.id, amount: a.amount },
      });
    }

    const credited = (alreadyCredited._sum.amount || 0) + total;
    const fullyCredited = credited >= (claim.approvedAmount || 0);
    const updated = await tx.reimbursement.update({
      where: { id: claim.id },
      data: { status: fullyCredited ? 'CREDITED' : 'APPROVED' },
      include: claimInclude,
    });
    return updated;
  });

  if (actorId) {
    await prisma.notification.create({
      data: {
        societyId,
        userId: claim.memberId,
        type: 'GENERAL',
        title: 'Reimbursement credited',
        body: `Rs. ${total} of your out-of-pocket claim has been adjusted against your maintenance dues.`,
        link: '/reimbursements',
      },
    });
  }
  return { claim: serialise(status) };
}

// --- List (admin: all claims in society, member: own unit's claims) ---
router.get('/', protect, async (req, res, next) => {
  try {
    const where = { societyId: req.user.societyId };
    if (req.user.role !== 'ADMIN') where.unitId = req.user.unitId || -1;
    if (req.query.status) where.status = String(req.query.status);

    const claims = await prisma.reimbursement.findMany({
      where,
      include: claimInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ reimbursements: claims.map(serialise) });
  } catch (err) {
    next(err);
  }
});

// --- Bills available for crediting (used by the approval modal) ---
router.get('/bills/:unitId', protect, adminOnly, async (req, res, next) => {
  try {
    const unitId = Number(req.params.unitId);
    const unit = await prisma.unit.findFirst({ where: { id: unitId, societyId: req.user.societyId } });
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    const bills = await billsWithOutstanding(req.user.societyId, unitId);
    res.json({ bills });
  } catch (err) {
    next(err);
  }
});

// --- Record a claim (admin records an expense a member paid from pocket) ---
router.post('/', protect, adminOnly, upload.single('receipt'), async (req, res, next) => {
  try {
    const body = z
      .object({
        memberId: z.union([z.string(), z.number()]),
        categoryId: z.union([z.string(), z.number()]),
        amount: z.union([z.string(), z.number()]),
        date: z.string().optional(),
        description: z.string().optional().nullable(),
        receiptPath: z.string().optional().nullable(),
      })
      .parse(req.body);

    const member = await prisma.user.findFirst({
      where: { id: Number(body.memberId), societyId: req.user.societyId, role: 'MEMBER' },
      include: { unit: true },
    });
    if (!member) return res.status(400).json({ error: 'Member not found in this society' });
    if (!member.unitId) return res.status(400).json({ error: 'Member has no unit assigned' });

    const category = await prisma.expenseCategory.findFirst({
      where: { id: Number(body.categoryId), societyId: req.user.societyId },
    });
    if (!category) return res.status(400).json({ error: 'Category not found in this society' });

    const amount = Math.round(Number(body.amount));
    if (!(amount > 0)) return res.status(400).json({ error: 'Amount must be greater than zero' });

    const claim = await prisma.reimbursement.create({
      data: {
        societyId: req.user.societyId,
        unitId: member.unitId,
        memberId: member.id,
        categoryId: category.id,
        amount,
        date: body.date ? new Date(body.date) : new Date(),
        description: body.description || null,
        receiptPath: req.file ? `/uploads/${req.file.filename}` : body.receiptPath || null,
        createdById: req.user.id,
      },
      include: claimInclude,
    });
    res.status(201).json({ reimbursement: serialise(claim) });
  } catch (err) {
    next(err);
  }
});

// --- Approve (optionally with credit allocation) or reject a claim ---
router.patch('/:id/decision', protect, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = z
      .object({
        decision: z.enum(['APPROVE', 'REJECT']),
        approvedAmount: z.union([z.string(), z.number()]).optional(),
        note: z.string().optional().nullable(),
        allocations: allocationSchema.optional(),
      })
      .parse(req.body);

    const claim = await prisma.reimbursement.findFirst({
      where: { id, societyId: req.user.societyId },
      include: { member: { select: { name: true } }, unit: { select: { unitNo: true } } },
    });
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    if (claim.status !== 'PENDING') return res.status(400).json({ error: 'Only pending claims can be decided' });

    if (body.decision === 'REJECT') {
      const rejected = await prisma.reimbursement.update({
        where: { id },
        data: { status: 'REJECTED', decisionNote: body.note || null, approvedById: req.user.id, approvedAt: new Date() },
        include: claimInclude,
      });
      await prisma.notification.create({
        data: {
          societyId: req.user.societyId,
          userId: claim.memberId,
          type: 'GENERAL',
          title: 'Reimbursement rejected',
          body: `Your out-of-pocket claim of Rs. ${claim.amount} was rejected.${body.note ? ` Note: ${body.note}` : ''}`,
          link: '/reimbursements',
        },
      });
      return res.json({ reimbursement: serialise(rejected) });
    }

    const approvedAmount = Math.round(Number(body.approvedAmount ?? claim.amount));
    if (!(approvedAmount > 0 && approvedAmount <= claim.amount)) {
      return res.status(400).json({ error: `Eligible amount must be between 1 and ${claim.amount}` });
    }

    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          societyId: claim.societyId,
          categoryId: claim.categoryId,
          vendor: `Reimbursement - ${claim.member.name} (Unit ${claim.unit.unitNo})`,
          amount: approvedAmount,
          date: claim.date,
          description: claim.description
            ? `Member paid out-of-pocket: ${claim.description}`
            : 'Member paid out-of-pocket for society work',
          receiptPath: claim.receiptPath,
          createdById: req.user.id,
        },
      });
      await tx.reimbursement.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedAmount,
          decisionNote: body.note || null,
          approvedById: req.user.id,
          approvedAt: new Date(),
          expenseId: created.id,
        },
      });
      return created;
    });

    await prisma.notification.create({
      data: {
        societyId: req.user.societyId,
        userId: claim.memberId,
        type: 'GENERAL',
        title: 'Reimbursement approved',
        body: `Your out-of-pocket claim of Rs. ${claim.amount} has been approved for Rs. ${approvedAmount}.`,
        link: '/reimbursements',
      },
    });

    let finalClaim = await prisma.reimbursement.findFirst({ where: { id }, include: claimInclude });
    if (body.allocations && body.allocations.length > 0) {
      const applied = await applyAllocations(finalClaim, body.allocations, req.user.societyId, req.user.id);
      if (applied.error) return res.status(400).json({ error: applied.error, reimbursement: serialise(finalClaim) });
      finalClaim = applied.claim;
    }

    res.json({ reimbursement: finalClaim, expense });
  } catch (err) {
    next(err);
  }
});

// --- Credit an already-approved claim against pending bills ---
router.post('/:id/credit', protect, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = z.object({ allocations: allocationSchema }).parse(req.body);

    const claim = await prisma.reimbursement.findFirst({
      where: { id, societyId: req.user.societyId },
      include: claimInclude,
    });
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    if (claim.status !== 'APPROVED') return res.status(400).json({ error: 'Only approved claims can be credited' });

    const result = await applyAllocations(claim, body.allocations, req.user.societyId, req.user.id);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ reimbursement: result.claim });
  } catch (err) {
    next(err);
  }
});

// --- Delete a claim while it is still pending ---
router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const claim = await prisma.reimbursement.findFirst({ where: { id, societyId: req.user.societyId } });
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    if (claim.status !== 'PENDING') return res.status(400).json({ error: 'Only pending claims can be deleted' });
    await prisma.reimbursement.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
