const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

const createSchema = z.object({
  category: z
    .enum(['PLUMBING', 'ELECTRICAL', 'CLEANING', 'LIFT', 'PARKING', 'WATER', 'NOISE', 'OTHER'])
    .default('OTHER'),
  title: z.string().min(3),
  description: z.string().min(3),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
});

router.get('/', protect, async (req, res, next) => {
  try {
    const where = { societyId: req.user.societyId };
    if (req.user.role !== 'ADMIN') where.userId = req.user.id;
    const complaints = await prisma.complaint.findMany({
      where,
      include: {
        user: { select: { name: true, phone: true } },
        unit: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ complaints });
  } catch (err) {
    next(err);
  }
});

router.post('/', protect, async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const complaint = await prisma.complaint.create({
      data: {
        societyId: req.user.societyId,
        userId: req.user.id,
        unitId: req.user.unitId,
        category: data.category,
        title: data.title,
        description: data.description,
        priority: data.priority,
        status: 'OPEN',
      },
      include: {
        user: { select: { name: true, phone: true } },
        unit: true,
      },
    });
    res.status(201).json({ complaint });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const parsed = z
      .object({
        status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'DELETED']).optional(),
        adminNote: z.string().optional().nullable(),
      })
      .parse(req.body);

    const id = Number(req.params.id);
    const existing = await prisma.complaint.findFirst({
      where: { id, societyId: req.user.societyId },
    });
    if (!existing) return res.status(404).json({ error: 'Complaint not found' });

    const complaint = await prisma.complaint.update({
      where: { id },
      data: {
        ...(parsed.status ? { status: parsed.status } : {}),
        ...(parsed.adminNote !== undefined ? { adminNote: parsed.adminNote } : {}),
        ...(parsed.status === 'RESOLVED' || parsed.status === 'CLOSED' ? { resolvedAt: new Date() } : {}),
      },
      include: {
        user: { select: { name: true, phone: true } },
        unit: true,
      },
    });
    res.json({ complaint });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
