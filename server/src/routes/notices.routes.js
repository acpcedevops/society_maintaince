const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, async (req, res, next) => {
  try {
    const notices = await prisma.notice.findMany({
      where: { societyId: req.user.societyId },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ notices });
  } catch (err) {
    next(err);
  }
});

router.post('/', protect, adminOnly, async (req, res, next) => {
  try {
    const data = z.object({ title: z.string().min(3), body: z.string().min(3) }).parse(req.body);
    const notice = await prisma.notice.create({
      data: {
        societyId: req.user.societyId,
        title: data.title,
        body: data.body,
        createdById: req.user.id,
      },
      include: { createdBy: { select: { name: true } } },
    });
    res.status(201).json({ notice });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.notice.findFirst({ where: { id, societyId: req.user.societyId } });
    if (!existing) return res.status(404).json({ error: 'Notice not found' });
    await prisma.notice.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
