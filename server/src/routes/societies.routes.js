const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// Public: used by the login/registration screens to pick a society.
router.get('/', async (req, res, next) => {
  try {
    const societies = await prisma.society.findMany({
      select: { id: true, name: true, code: true, address: true },
      orderBy: { name: 'asc' },
    });
    res.json({ societies });
  } catch (err) {
    next(err);
  }
});

// Public: unit list for a society, used when a member registers.
router.get('/:id/units', async (req, res, next) => {
  try {
    const societyId = Number(req.params.id);
    if (!Number.isFinite(societyId)) {
      return res.status(400).json({ error: 'Invalid society id' });
    }
    const units = await prisma.unit.findMany({
      where: { societyId },
      select: { id: true, unitNo: true, bhk: true, floor: true },
      orderBy: { unitNo: 'asc' },
    });
    res.json({ units });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
