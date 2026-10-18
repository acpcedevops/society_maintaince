const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { signSuper } = require('../lib/jwt');
const { protectSuper } = require('../middleware/auth');
const { generateUniqueCode, generateUsername, createSocietyDefaults } = require('../lib/society');

const router = express.Router();

function publicSuper(admin) {
  if (!admin) return null;
  const { passwordHash, ...rest } = admin;
  return rest;
}

function maskConfig(config) {
  if (!config) return null;
  const { cashfreeSecretKey, ...rest } = config;
  return {
    ...rest,
    hasCashfree: Boolean(config.cashfreeAppId && config.cashfreeSecretKey),
  };
}

const paymentSchema = z.object({
  upiId: z.string().trim().max(120).optional().nullable(),
  payeeName: z.string().trim().max(120).optional().nullable(),
  bankName: z.string().trim().max(120).optional().nullable(),
  bankAccountName: z.string().trim().max(120).optional().nullable(),
  bankAccountNumber: z.string().trim().max(40).optional().nullable(),
  bankIfsc: z.string().trim().max(20).optional().nullable(),
  cashfreeAppId: z.string().trim().max(120).optional().nullable(),
  cashfreeSecretKey: z.string().trim().max(200).optional().nullable(),
  qrImagePath: z.string().trim().max(500).optional().nullable(),
});

function clean(value) {
  if (value === undefined) return undefined;
  const trimmed = typeof value === 'string' ? value.trim() : value;
  return trimmed ? trimmed : null;
}

async function findSociety(id) {
  const societyId = Number(id);
  if (!Number.isFinite(societyId)) return null;
  return prisma.society.findUnique({ where: { id: societyId } });
}

/* ------------------------------- Auth ------------------------------- */

router.post('/auth/login', async (req, res, next) => {
  try {
    const data = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .parse(req.body);

    const admin = await prisma.superAdmin.findUnique({
      where: { email: data.email.trim().toLowerCase() },
    });
    if (!admin || !(await bcrypt.compare(data.password, admin.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({ token: signSuper(admin), admin: publicSuper(admin) });
  } catch (err) {
    next(err);
  }
});

router.get('/auth/me', protectSuper, (req, res) => {
  res.json({ admin: publicSuper(req.superAdmin) });
});

/* ---------------------------- Societies ----------------------------- */

router.get('/overview', protectSuper, async (req, res, next) => {
  try {
    const [total, pending, approved, rejected, members] = await Promise.all([
      prisma.society.count(),
      prisma.society.count({ where: { status: 'PENDING' } }),
      prisma.society.count({ where: { status: 'APPROVED' } }),
      prisma.society.count({ where: { status: 'REJECTED' } }),
      prisma.user.count({ where: { role: 'MEMBER' } }),
    ]);
    res.json({ stats: { total, pending, approved, rejected, members } });
  } catch (err) {
    next(err);
  }
});

router.get('/societies', protectSuper, async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    const societies = await prisma.society.findMany({
      where: status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status) ? { status } : {},
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        paymentConfig: true,
        users: {
          where: { role: 'ADMIN' },
          select: { id: true, name: true, phone: true, email: true, status: true },
          orderBy: { id: 'asc' },
        },
        _count: { select: { units: true, users: true } },
      },
    });
    res.json({
      societies: societies.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        address: s.address,
        status: s.status,
        createdAt: s.createdAt,
        admins: s.users,
        units: s._count.units,
        users: s._count.users,
        paymentConfig: maskConfig(s.paymentConfig),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/societies/:id', protectSuper, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid society id' });
    const society = await prisma.society.findUnique({
      where: { id },
      include: {
        paymentConfig: true,
        users: {
          where: { role: 'ADMIN' },
          select: { id: true, name: true, phone: true, email: true, status: true },
          orderBy: { id: 'asc' },
        },
        _count: { select: { units: true, users: true, complaints: true } },
      },
    });
    if (!society) return res.status(404).json({ error: 'Society not found' });
    res.json({
      society: {
        id: society.id,
        name: society.name,
        code: society.code,
        address: society.address,
        status: society.status,
        createdAt: society.createdAt,
        admins: society.users,
        counts: society._count,
        paymentConfig: maskConfig(society.paymentConfig),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/societies', protectSuper, async (req, res, next) => {
  try {
    const data = z
      .object({
        name: z.string().min(2),
        address: z.string().optional().nullable(),
        adminName: z.string().min(2),
        adminPhone: z.string().min(10),
        adminEmail: z.string().email().optional().or(z.literal('')).nullable(),
        adminPassword: z.string().min(6),
      })
      .parse(req.body);

    const existing = await prisma.society.findUnique({ where: { name: data.name } });
    if (existing) return res.status(409).json({ error: 'A society with this name already exists' });

    const code = await generateUniqueCode(data.name);
    const society = await prisma.society.create({
      data: { name: data.name, code, address: data.address || null, status: 'APPROVED' },
    });
    await createSocietyDefaults(society.id);

    await prisma.user.create({
      data: {
        societyId: society.id,
        name: data.adminName,
        phone: data.adminPhone,
        username: await generateUsername(data.adminPhone, society.id),
        email: data.adminEmail || null,
        passwordHash: await bcrypt.hash(data.adminPassword, 10),
        role: 'ADMIN',
        status: 'APPROVED',
      },
    });

    res.status(201).json({ society: { id: society.id, name: society.name, code: society.code } });
  } catch (err) {
    next(err);
  }
});

router.post('/societies/:id/approve', protectSuper, async (req, res, next) => {
  try {
    const society = await findSociety(req.params.id);
    if (!society) return res.status(404).json({ error: 'Society not found' });

    await prisma.society.update({ where: { id: society.id }, data: { status: 'APPROVED' } });
    await prisma.user.updateMany({
      where: { societyId: society.id, role: 'ADMIN', status: { not: 'REJECTED' } },
      data: { status: 'APPROVED' },
    });

    const admins = await prisma.user.findMany({
      where: { societyId: society.id, role: 'ADMIN', status: 'APPROVED' },
      select: { id: true },
    });
    for (const admin of admins) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.notification.create({
        data: {
          societyId: society.id,
          userId: admin.id,
          type: 'GENERAL',
          title: 'Society approved',
          body: `${society.name} has been approved by the platform. You can now manage the society.`,
          link: '/',
        },
      });
    }

    res.json({ ok: true, status: 'APPROVED' });
  } catch (err) {
    next(err);
  }
});

router.post('/societies/:id/reject', protectSuper, async (req, res, next) => {
  try {
    const society = await findSociety(req.params.id);
    if (!society) return res.status(404).json({ error: 'Society not found' });

    await prisma.society.update({ where: { id: society.id }, data: { status: 'REJECTED' } });
    await prisma.user.updateMany({
      where: { societyId: society.id, role: 'ADMIN' },
      data: { status: 'REJECTED' },
    });

    res.json({ ok: true, status: 'REJECTED' });
  } catch (err) {
    next(err);
  }
});

router.delete('/societies/:id', protectSuper, async (req, res, next) => {
  try {
    const society = await findSociety(req.params.id);
    if (!society) return res.status(404).json({ error: 'Society not found' });

    const id = society.id;
    const [bills, users] = await Promise.all([
      prisma.bill.findMany({ where: { unit: { societyId: id } }, select: { id: true } }),
      prisma.user.findMany({ where: { societyId: id }, select: { id: true } }),
    ]);
    const billIds = bills.map((b) => b.id);
    const userIds = users.map((u) => u.id);

    // Delete in dependency order (no DB-level cascade is defined).
    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { billId: { in: billIds } } }),
      prisma.bill.deleteMany({ where: { unit: { societyId: id } } }),
      prisma.complaint.deleteMany({ where: { societyId: id } }),
      prisma.gatePass.deleteMany({ where: { societyId: id } }),
      prisma.package.deleteMany({ where: { societyId: id } }),
      prisma.gateEntry.deleteMany({ where: { societyId: id } }),
      prisma.notification.deleteMany({ where: { societyId: id } }),
      prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.notice.deleteMany({ where: { societyId: id } }),
      prisma.expense.deleteMany({ where: { societyId: id } }),
      prisma.expenseCategory.deleteMany({ where: { societyId: id } }),
      prisma.maintenanceConfig.deleteMany({ where: { societyId: id } }),
      prisma.securityPolicy.deleteMany({ where: { societyId: id } }),
      prisma.societyPaymentConfig.deleteMany({ where: { societyId: id } }),
      prisma.user.deleteMany({ where: { societyId: id } }),
      prisma.unit.deleteMany({ where: { societyId: id } }),
      prisma.society.delete({ where: { id } }),
    ]);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ------------------------- Payment settings ------------------------- */

router.get('/societies/:id/payment', protectSuper, async (req, res, next) => {
  try {
    const society = await findSociety(req.params.id);
    if (!society) return res.status(404).json({ error: 'Society not found' });
    const config = await prisma.societyPaymentConfig.findUnique({
      where: { societyId: society.id },
    });
    res.json({ paymentConfig: maskConfig(config) });
  } catch (err) {
    next(err);
  }
});

router.put('/societies/:id/payment', protectSuper, async (req, res, next) => {
  try {
    const society = await findSociety(req.params.id);
    if (!society) return res.status(404).json({ error: 'Society not found' });

    const data = paymentSchema.parse(req.body);
    const payload = {
      upiId: clean(data.upiId),
      payeeName: clean(data.payeeName),
      bankName: clean(data.bankName),
      bankAccountName: clean(data.bankAccountName),
      bankAccountNumber: clean(data.bankAccountNumber),
      bankIfsc: clean(data.bankIfsc),
      cashfreeAppId: clean(data.cashfreeAppId),
      qrImagePath: clean(data.qrImagePath),
    };
    if (data.cashfreeSecretKey !== undefined) {
      payload.cashfreeSecretKey = clean(data.cashfreeSecretKey);
    }

    const config = await prisma.societyPaymentConfig.upsert({
      where: { societyId: society.id },
      create: { societyId: society.id, ...payload },
      update: payload,
    });

    res.json({ paymentConfig: maskConfig(config) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
