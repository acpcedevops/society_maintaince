const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { protect, adminOnly } = require('../middleware/auth');
const { publicUser } = require('../lib/serialize');
const { generateUsername } = require('../lib/society');

const router = express.Router();

const memberSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  password: z.string().min(6).optional(),
  unitId: z.union([z.string(), z.number()]),
  isOwner: z.boolean().optional(),
});

router.get('/', protect, adminOnly, async (req, res, next) => {
  try {
    const members = await prisma.user.findMany({
      where: { role: 'MEMBER', societyId: req.user.societyId },
      include: { unit: true },
      orderBy: { id: 'asc' },
    });
    res.json({ members: members.map(publicUser) });
  } catch (err) {
    next(err);
  }
});

router.post('/', protect, adminOnly, async (req, res, next) => {
  try {
    const data = memberSchema.parse(req.body);
    const unit = await prisma.unit.findFirst({
      where: { id: Number(data.unitId), societyId: req.user.societyId },
    });
    if (!unit) return res.status(400).json({ error: 'Unit not found in this society' });

    const user = await prisma.user.create({
      data: {
        societyId: req.user.societyId,
        name: data.name,
        phone: data.phone,
        username: await generateUsername(data.phone, req.user.societyId),
        email: data.email || null,
        passwordHash: await bcrypt.hash(data.password || 'member123', 10),
        role: 'MEMBER',
        status: 'APPROVED',
        unitId: unit.id,
        isOwner: data.isOwner ?? true,
      },
    });
    res.status(201).json({ member: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// Approve or reject a (self-registered) member. Only affected by status PENDING/REJECTED.
router.patch('/:id/status', protect, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status } = z
      .object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']) })
      .parse(req.body);

    const existing = await prisma.user.findFirst({
      where: { id, societyId: req.user.societyId, role: 'MEMBER' },
    });
    if (!existing) return res.status(404).json({ error: 'Member not found' });

    const user = await prisma.user.update({
      where: { id },
      data: { status },
      include: { unit: true },
    });

    if (status === 'APPROVED' && existing.status !== 'APPROVED') {
      await prisma.notification.create({
        data: {
          societyId: req.user.societyId,
          userId: user.id,
          type: 'GENERAL',
          title: 'Account approved',
          body: 'Your account has been approved. You can now log in.',
          link: '/',
        },
      });
    }

    res.json({ member: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.user.findFirst({
      where: { id, societyId: req.user.societyId, role: 'MEMBER' },
    });
    if (!existing) return res.status(404).json({ error: 'Member not found' });

    const data = memberSchema.partial().parse(req.body);
    if (data.unitId !== undefined) {
      const unit = await prisma.unit.findFirst({
        where: { id: Number(data.unitId), societyId: req.user.societyId },
      });
      if (!unit) return res.status(400).json({ error: 'Unit not found in this society' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.email !== undefined ? { email: data.email || null } : {}),
        ...(data.password ? { passwordHash: await bcrypt.hash(data.password, 10) } : {}),
        ...(data.unitId !== undefined ? { unitId: Number(data.unitId) } : {}),
        ...(data.isOwner !== undefined ? { isOwner: data.isOwner } : {}),
      },
    });
    res.json({ member: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.user.findFirst({
      where: { id, societyId: req.user.societyId, role: 'MEMBER' },
    });
    if (!existing) return res.status(404).json({ error: 'Member not found' });
    await prisma.user.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
