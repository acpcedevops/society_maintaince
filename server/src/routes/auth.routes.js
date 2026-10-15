const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { sign } = require('../lib/jwt');
const { protect } = require('../middleware/auth');
const { publicUser } = require('../lib/serialize');
const { generateUniqueCode, createSocietyDefaults } = require('../lib/society');

const router = express.Router();

const memberRegisterSchema = z.object({
  type: z.literal('member').optional(),
  societyId: z.union([z.string(), z.number()]).optional(),
  societyCode: z.string().optional(),
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal('')),
  password: z.string().min(6),
  unitNo: z.string().optional(),
});

const adminRegisterSchema = z.object({
  type: z.literal('admin'),
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal('')),
  password: z.string().min(6),
  societyName: z.string().min(2),
  societyAddress: z.string().optional().nullable(),
});

const loginSchema = z.object({
  societyId: z.union([z.string(), z.number()]).optional(),
  societyCode: z.string().optional(),
  phone: z.string().min(10),
  password: z.string().min(1),
});

async function resolveSociety({ societyId, societyCode }) {
  if (societyId !== undefined && societyId !== null && societyId !== '') {
    return prisma.society.findUnique({ where: { id: Number(societyId) } });
  }
  if (societyCode) {
    return prisma.society.findUnique({ where: { code: societyCode } });
  }
  return null;
}

const userInclude = { unit: true, society: true };

// Create a brand-new society with the caller as its first admin.
router.post('/register-society', async (req, res, next) => {
  try {
    const data = adminRegisterSchema.parse({ ...req.body, type: 'admin' });

    const existingSociety = await prisma.society.findUnique({ where: { name: data.societyName } });
    if (existingSociety) {
      return res.status(409).json({ error: 'A society with this name already exists' });
    }

    const code = await generateUniqueCode(data.societyName);
    const society = await prisma.society.create({
      data: { name: data.societyName, code, address: data.societyAddress || null },
    });
    await createSocietyDefaults(society.id);

    const user = await prisma.user.create({
      data: {
        societyId: society.id,
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        passwordHash: await bcrypt.hash(data.password, 10),
        role: 'ADMIN',
        isOwner: false,
      },
      include: userInclude,
    });

    res.status(201).json({ token: sign(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// Join an existing society as a member.
router.post('/register', async (req, res, next) => {
  try {
    if (req.body?.type === 'admin' || req.body?.societyName) {
      return res.status(400).json({ error: 'Use /auth/register-society to create a society' });
    }

    const data = memberRegisterSchema.parse(req.body);
    const society = await resolveSociety(data);
    if (!society) {
      return res.status(400).json({ error: 'Please select a valid society' });
    }

    const existing = await prisma.user.findUnique({
      where: { societyId_phone: { societyId: society.id, phone: data.phone } },
    });
    if (existing) {
      return res.status(409).json({ error: 'Phone number already registered in this society' });
    }

    let unitId = null;
    if (data.unitNo) {
      const unit = await prisma.unit.findUnique({
        where: { societyId_unitNo: { societyId: society.id, unitNo: data.unitNo } },
      });
      if (!unit) {
        return res.status(400).json({ error: `Unit ${data.unitNo} not found in ${society.name}` });
      }
      unitId = unit.id;
    }

    const user = await prisma.user.create({
      data: {
        societyId: society.id,
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        passwordHash: await bcrypt.hash(data.password, 10),
        role: 'MEMBER',
        unitId,
        isOwner: true,
      },
      include: userInclude,
    });

    res.status(201).json({ token: sign(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const login = loginSchema.parse(req.body);
    const { phone, password } = login;
    const society = await resolveSociety(login);
    if (!society) {
      return res.status(400).json({ error: 'Please select a valid society' });
    }

    const user = await prisma.user.findUnique({
      where: { societyId_phone: { societyId: society.id, phone } },
      include: userInclude,
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid phone number or password' });
    }
    res.json({ token: sign(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', protect, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
