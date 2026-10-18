const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { protect, adminOnly, gateAccess } = require('../middleware/auth');
const { publicUser } = require('../lib/serialize');
const { generateUsername } = require('../lib/society');

const router = express.Router();

const VISITOR_TYPES = ['GUEST', 'DELIVERY', 'CAB', 'MAID', 'COOK', 'MAINTENANCE', 'OTHER'];
const PLACEMENTS = ['GATE', 'LOBBY', 'DROPBOX', 'HANDED_DIRECT'];

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generatePassToken() {
  return crypto.randomBytes(24).toString('hex');
}

function decoratePass(pass, now = new Date()) {
  const expired = pass.status === 'ACTIVE' && pass.expiresAt && pass.expiresAt.getTime() < now.getTime();
  return { ...pass, status: expired ? 'EXPIRED' : pass.status, isExpired: expired };
}

async function getPolicy(societyId) {
  let policy = await prisma.securityPolicy.findUnique({ where: { societyId } });
  if (!policy) {
    policy = await prisma.securityPolicy.create({ data: { societyId } });
  }
  return policy;
}

async function notifyUser(userId, societyId, type, title, body, link, meta) {
  await prisma.notification.create({
    data: { societyId, userId, type, title, body: body || null, link: link || null, meta: meta || undefined },
  });
}

async function notifyUnit(unitId, societyId, type, title, body, link, meta) {
  const members = await prisma.user.findMany({ where: { unitId }, select: { id: true } });
  for (const m of members) {
    // eslint-disable-next-line no-await-in-loop
    await notifyUser(m.id, societyId, type, title, body, link, meta);
  }
}

async function notifyGuards(societyId, type, title, body, link, meta) {
  const guards = await prisma.user.findMany({
    where: { societyId, role: { in: ['GUARD', 'ADMIN'] } },
    select: { id: true },
  });
  for (const g of guards) {
    // eslint-disable-next-line no-await-in-loop
    await notifyUser(g.id, societyId, type, title, body, link, meta);
  }
}

function decorateEntry(entry, policy, now = new Date()) {
  const expired =
    entry.status === 'PENDING' && entry.otpExpiresAt && entry.otpExpiresAt.getTime() < now.getTime();
  return { ...entry, status: expired ? 'EXPIRED' : entry.status, isExpired: expired };
}

/* ------------------------------- Policy ------------------------------- */

router.get('/policy', protect, async (req, res, next) => {
  try {
    const policy = await getPolicy(req.user.societyId);
    res.json({ policy });
  } catch (err) {
    next(err);
  }
});

router.put('/policy', protect, adminOnly, async (req, res, next) => {
  try {
    const data = z
      .object({
        mode: z.enum(['GATED', 'NON_GATED', 'HYBRID']).optional(),
        requireOtpForDelivery: z.boolean().optional(),
        guardCanOverride: z.boolean().optional(),
        dropPointEnabled: z.boolean().optional(),
        dropPointLabel: z.string().optional().nullable(),
        otpExpiryMinutes: z.union([z.string(), z.number()]).optional(),
      })
      .parse(req.body);

    await getPolicy(req.user.societyId);
    const policy = await prisma.securityPolicy.update({
      where: { societyId: req.user.societyId },
      data: {
        ...(data.mode !== undefined ? { mode: data.mode } : {}),
        ...(data.requireOtpForDelivery !== undefined ? { requireOtpForDelivery: data.requireOtpForDelivery } : {}),
        ...(data.guardCanOverride !== undefined ? { guardCanOverride: data.guardCanOverride } : {}),
        ...(data.dropPointEnabled !== undefined ? { dropPointEnabled: data.dropPointEnabled } : {}),
        ...(data.dropPointLabel !== undefined ? { dropPointLabel: data.dropPointLabel } : {}),
        ...(data.otpExpiryMinutes !== undefined ? { otpExpiryMinutes: Number(data.otpExpiryMinutes) } : {}),
      },
    });
    res.json({ policy });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- Guards ------------------------------- */

const guardSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  password: z.string().min(6).optional(),
});

router.get('/guards', protect, adminOnly, async (req, res, next) => {
  try {
    const guards = await prisma.user.findMany({
      where: { societyId: req.user.societyId, role: 'GUARD' },
      orderBy: { id: 'asc' },
    });
    res.json({ guards: guards.map(publicUser) });
  } catch (err) {
    next(err);
  }
});

router.post('/guards', protect, adminOnly, async (req, res, next) => {
  try {
    const data = guardSchema.parse(req.body);
    const existing = await prisma.user.findUnique({
      where: { societyId_phone: { societyId: req.user.societyId, phone: data.phone } },
    });
    if (existing) return res.status(409).json({ error: 'Phone already registered in this society' });

    const guard = await prisma.user.create({
      data: {
        societyId: req.user.societyId,
        name: data.name,
        phone: data.phone,
        username: await generateUsername(data.phone, req.user.societyId),
        email: data.email || null,
        passwordHash: await bcrypt.hash(data.password || 'guard123', 10),
        role: 'GUARD',
        isOwner: false,
      },
    });
    res.status(201).json({ guard: publicUser(guard) });
  } catch (err) {
    next(err);
  }
});

router.put('/guards/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.user.findFirst({
      where: { id, societyId: req.user.societyId, role: 'GUARD' },
    });
    if (!existing) return res.status(404).json({ error: 'Guard not found' });
    const data = guardSchema.partial().parse(req.body);
    const guard = await prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.email !== undefined ? { email: data.email || null } : {}),
        ...(data.password ? { passwordHash: await bcrypt.hash(data.password, 10) } : {}),
      },
    });
    res.json({ guard: publicUser(guard) });
  } catch (err) {
    next(err);
  }
});

router.delete('/guards/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.user.findFirst({
      where: { id, societyId: req.user.societyId, role: 'GUARD' },
    });
    if (!existing) return res.status(404).json({ error: 'Guard not found' });
    await prisma.user.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- Entries ------------------------------ */

const entrySchema = z.object({
  unitId: z.union([z.string(), z.number()]),
  type: z.enum(VISITOR_TYPES).default('GUEST'),
  name: z.string().min(2),
  phone: z.string().optional().nullable(),
  vehicleNo: z.string().optional().nullable(),
  purpose: z.string().optional().nullable(),
  photoPath: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  directAdmit: z.boolean().optional(),
});

const entryInclude = {
  unit: { select: { id: true, unitNo: true } },
  loggedBy: { select: { id: true, name: true } },
  decisionBy: { select: { id: true, name: true } },
};

router.get('/entries', protect, async (req, res, next) => {
  try {
    const policy = await getPolicy(req.user.societyId);
    const where = { societyId: req.user.societyId };
    if (req.user.role === 'MEMBER') where.unitId = req.user.unitId;
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.type) where.type = String(req.query.type);
    const entries = await prisma.gateEntry.findMany({
      where,
      include: entryInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ entries: entries.map((e) => decorateEntry(e, policy)) });
  } catch (err) {
    next(err);
  }
});

router.post('/entries', protect, async (req, res, next) => {
  try {
    const isGuard = req.user.role === 'GUARD' || req.user.role === 'ADMIN';
    const data = entrySchema.parse(req.body);
    const policy = await getPolicy(req.user.societyId);

    let unitId;
    if (req.user.role === 'MEMBER') {
      unitId = req.user.unitId;
      if (!unitId) return res.status(400).json({ error: 'You have no unit assigned' });
    } else {
      const unit = await prisma.unit.findFirst({
        where: { id: Number(data.unitId), societyId: req.user.societyId },
      });
      if (!unit) return res.status(400).json({ error: 'Unit not found in this society' });
      unitId = unit.id;
    }

    const requireOtp = data.type === 'DELIVERY' && policy.requireOtpForDelivery;
    const otp = requireOtp ? generateOtp() : null;
    const otpExpiresAt = requireOtp ? new Date(Date.now() + policy.otpExpiryMinutes * 60 * 1000) : null;

    const admit = isGuard && data.directAdmit && policy.guardCanOverride;

    const entry = await prisma.gateEntry.create({
      data: {
        societyId: req.user.societyId,
        unitId,
        type: data.type,
        name: data.name,
        phone: data.phone || null,
        vehicleNo: data.vehicleNo || null,
        purpose: data.purpose || null,
        photoPath: data.photoPath || null,
        notes: data.notes || null,
        otp,
        otpExpiresAt,
        status: admit ? 'ENTERED' : 'PENDING',
        enteredAt: admit ? new Date() : null,
        createdById: req.user.id,
        loggedById: req.user.role === 'GUARD' ? req.user.id : null,
      },
      include: entryInclude,
    });

    if (!admit) {
      await notifyUnit(
        unitId,
        req.user.societyId,
        'VISITOR_REQUEST',
        `${data.type === 'DELIVERY' ? 'Delivery' : 'Visitor'} at gate`,
        `${entry.name} for unit ${entry.unit.unitNo}`,
        '/gate',
        { entryId: entry.id }
      );
    }

    res.status(201).json({ entry: decorateEntry(entry, policy) });
  } catch (err) {
    next(err);
  }
});

router.post('/entries/:id/decision', protect, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = z
      .object({
        decision: z.enum(['APPROVED', 'DENIED']),
        placement: z.enum(PLACEMENTS).optional(),
        note: z.string().optional().nullable(),
      })
      .parse(req.body);

    const entry = await prisma.gateEntry.findFirst({
      where: { id, societyId: req.user.societyId },
      include: entryInclude,
    });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const isResident = req.user.role === 'MEMBER' && entry.unitId === req.user.unitId;
    const isAdmin = req.user.role === 'ADMIN';
    if (!isResident && !isAdmin) {
      return res.status(403).json({ error: 'Not allowed to decide this entry' });
    }
    if (entry.status !== 'PENDING' && entry.status !== 'EXPIRED') {
      return res.status(409).json({ error: `Entry already ${entry.status}` });
    }

    const updated = await prisma.gateEntry.update({
      where: { id },
      data: {
        status: data.decision,
        decisionById: req.user.id,
        ...(data.note !== undefined ? { notes: data.note } : {}),
      },
      include: entryInclude,
    });

    if (data.decision === 'APPROVED' && data.placement && data.placement !== 'HANDED_DIRECT') {
      await prisma.package.create({
        data: {
          societyId: req.user.societyId,
          gateEntryId: updated.id,
          unitId: updated.unitId,
          partner: updated.purpose || updated.name,
          placement: data.placement,
          status: 'WAITING',
        },
      });
      await notifyUnit(
        updated.unitId,
        req.user.societyId,
        'PACKAGE_WAITING',
        'Package waiting for you',
        `Left at ${data.placement} by ${updated.name}`,
        '/gate',
        { entryId: updated.id }
      );
    }

    await notifyGuards(
      req.user.societyId,
      'VISITOR_DECISION',
      `Entry ${data.decision.toLowerCase()}`,
      `${updated.name} for unit ${updated.unit.unitNo}`,
      '/gate',
      { entryId: updated.id }
    );

    const policy = await getPolicy(req.user.societyId);
    res.json({ entry: decorateEntry(updated, policy) });
  } catch (err) {
    next(err);
  }
});

router.post('/entries/:id/enter', protect, gateAccess, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const entry = await prisma.gateEntry.findFirst({
      where: { id, societyId: req.user.societyId },
      include: entryInclude,
    });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const policy = await getPolicy(req.user.societyId);
    const currentStatus =
      entry.status === 'PENDING' && entry.otpExpiresAt && entry.otpExpiresAt.getTime() < Date.now()
        ? 'EXPIRED'
        : entry.status;

    if (currentStatus !== 'APPROVED' && !policy.guardCanOverride) {
      return res.status(409).json({ error: 'Entry is not approved' });
    }

    const updated = await prisma.gateEntry.update({
      where: { id },
      data: { status: 'ENTERED', enteredAt: new Date(), loggedById: req.user.id },
      include: entryInclude,
    });
    res.json({ entry: decorateEntry(updated, policy) });
  } catch (err) {
    next(err);
  }
});

router.post('/entries/:id/exit', protect, gateAccess, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const entry = await prisma.gateEntry.findFirst({
      where: { id, societyId: req.user.societyId },
    });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    const updated = await prisma.gateEntry.update({
      where: { id },
      data: { status: 'EXITED', exitedAt: new Date(), loggedById: req.user.id },
      include: entryInclude,
    });
    const policy = await getPolicy(req.user.societyId);
    res.json({ entry: decorateEntry(updated, policy) });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ Packages ------------------------------ */

const packageInclude = {
  unit: { select: { id: true, unitNo: true } },
  gateEntry: { select: { id: true, name: true, type: true } },
  collectedBy: { select: { id: true, name: true } },
};

router.get('/packages', protect, async (req, res, next) => {
  try {
    const where = { societyId: req.user.societyId };
    if (req.user.role === 'MEMBER') where.unitId = req.user.unitId;
    if (req.query.status) where.status = String(req.query.status);
    const packages = await prisma.package.findMany({
      where,
      include: packageInclude,
      orderBy: { receivedAt: 'desc' },
      take: 200,
    });
    res.json({ packages });
  } catch (err) {
    next(err);
  }
});

router.post('/packages/:id/collect', protect, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const pkg = await prisma.package.findFirst({
      where: { id, societyId: req.user.societyId },
      include: packageInclude,
    });
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const isResident = req.user.role === 'MEMBER' && pkg.unitId === req.user.unitId;
    const isGate = req.user.role === 'GUARD' || req.user.role === 'ADMIN';
    if (!isResident && !isGate) return res.status(403).json({ error: 'Not allowed' });
    if (pkg.status === 'COLLECTED') return res.json({ package: pkg });

    const updated = await prisma.package.update({
      where: { id },
      data: { status: 'COLLECTED', collectedAt: new Date(), collectedById: req.user.id },
      include: packageInclude,
    });

    await notifyUnit(
      pkg.unitId,
      req.user.societyId,
      'PACKAGE_COLLECTED',
      'Package collected',
      `Package for unit ${pkg.unit.unitNo} marked collected`,
      '/gate',
      { packageId: pkg.id }
    );

    res.json({ package: updated });
  } catch (err) {
    next(err);
  }
});

/* ---------------------- QR Gate passes (deliveries) -------------------- */

const passInclude = {
  unit: { select: { id: true, unitNo: true } },
  gateEntry: { select: { id: true, name: true, type: true, status: true } },
  createdBy: { select: { id: true, name: true } },
  usedBy: { select: { id: true, name: true } },
};

const passSchema = z.object({
  unitId: z.union([z.string(), z.number()]).optional(),
  gateEntryId: z.union([z.string(), z.number()]).optional().nullable(),
  purpose: z.string().optional().nullable(),
  expiresInMinutes: z.union([z.string(), z.number()]).optional(),
});

async function resolveResident(unitId) {
  const members = await prisma.user.findMany({
    where: { unitId },
    select: { id: true, name: true, phone: true, role: true, isOwner: true },
  });
  return members.find((m) => m.isOwner) || members.find((m) => m.role === 'MEMBER') || members[0] || null;
}

router.post('/passes', protect, async (req, res, next) => {
  try {
    const data = passSchema.parse(req.body);
    const policy = await getPolicy(req.user.societyId);

    let unitId;
    if (req.user.role === 'MEMBER') {
      unitId = req.user.unitId;
      if (!unitId) return res.status(400).json({ error: 'You have no unit assigned' });
    } else {
      if (!data.unitId && !data.gateEntryId) {
        return res.status(400).json({ error: 'unitId is required' });
      }
      unitId = data.unitId ? Number(data.unitId) : undefined;
    }

    let gateEntryId = data.gateEntryId ? Number(data.gateEntryId) : null;
    if (gateEntryId) {
      const entry = await prisma.gateEntry.findFirst({
        where: { id: gateEntryId, societyId: req.user.societyId },
      });
      if (!entry) return res.status(400).json({ error: 'Entry not found in this society' });
      if (req.user.role === 'MEMBER' && entry.unitId !== req.user.unitId) {
        return res.status(403).json({ error: 'Entry belongs to another unit' });
      }
      unitId = entry.unitId;
    }

    if (!unitId) return res.status(400).json({ error: 'unitId is required' });
    const unit = await prisma.unit.findFirst({ where: { id: unitId, societyId: req.user.societyId } });
    if (!unit) return res.status(400).json({ error: 'Unit not found in this society' });

    const minutes = Math.min(Math.max(Number(data.expiresInMinutes) || policy.otpExpiryMinutes || 120, 5), 1440);
    const pass = await prisma.gatePass.create({
      data: {
        societyId: req.user.societyId,
        unitId,
        gateEntryId,
        token: generatePassToken(),
        purpose: data.purpose || null,
        expiresAt: new Date(Date.now() + minutes * 60 * 1000),
        createdById: req.user.id,
      },
      include: passInclude,
    });

    res.status(201).json({ pass: decoratePass(pass) });
  } catch (err) {
    next(err);
  }
});

router.get('/passes', protect, async (req, res, next) => {
  try {
    const where = { societyId: req.user.societyId };
    if (req.user.role === 'MEMBER') where.unitId = req.user.unitId;
    if (req.query.status) where.status = String(req.query.status);
    const passes = await prisma.gatePass.findMany({
      where,
      include: passInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ passes: passes.map((p) => decoratePass(p)) });
  } catch (err) {
    next(err);
  }
});

router.post('/passes/:id/revoke', protect, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const pass = await prisma.gatePass.findFirst({ where: { id, societyId: req.user.societyId } });
    if (!pass) return res.status(404).json({ error: 'Pass not found' });
    const isOwner = req.user.role === 'MEMBER' && pass.unitId === req.user.unitId;
    const isAdmin = req.user.role === 'ADMIN';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Not allowed' });

    const updated = await prisma.gatePass.update({
      where: { id },
      data: { status: pass.status === 'ACTIVE' ? 'REVOKED' : pass.status },
      include: passInclude,
    });
    res.json({ pass: decoratePass(updated) });
  } catch (err) {
    next(err);
  }
});

// Guard scans the resident's QR and submits the raw token here.
router.post('/passes/verify', protect, gateAccess, async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().min(8) }).parse(req.body);
    const clean = String(token).trim().replace(/^SMPASS:/i, '');

    const pass = await prisma.gatePass.findUnique({
      where: { token: clean },
      include: { unit: { select: { id: true, unitNo: true } }, gateEntry: true },
    });
    if (!pass || pass.societyId !== req.user.societyId) {
      return res.status(404).json({ error: 'Pass not found or not valid for this society' });
    }
    if (pass.status === 'REVOKED') return res.status(409).json({ error: 'Pass was revoked' });
    if (pass.status === 'USED') {
      return res.status(409).json({ error: 'Pass already used', pass: decoratePass({ ...pass, createdBy: undefined, usedBy: undefined }) });
    }
    if (pass.expiresAt && pass.expiresAt.getTime() < Date.now()) {
      await prisma.gatePass.update({ where: { id: pass.id }, data: { status: 'EXPIRED' } });
      return res.status(410).json({ error: 'Pass has expired' });
    }

    const policy = await getPolicy(req.user.societyId);
    const placement = PLACEMENTS.includes(req.body?.placement)
      ? req.body.placement
      : policy.dropPointEnabled
      ? 'GATE'
      : null;

    const updatedPass = await prisma.gatePass.update({
      where: { id: pass.id },
      data: { status: 'USED', usedById: req.user.id, usedAt: new Date() },
      include: passInclude,
    });

    let entry = null;
    let pkg = null;
    if (pass.gateEntryId) {
      entry = await prisma.gateEntry.findFirst({
        where: { id: pass.gateEntryId, societyId: req.user.societyId },
        include: entryInclude,
      });
      if (entry && entry.status !== 'ENTERED' && entry.status !== 'EXITED') {
        entry = await prisma.gateEntry.update({
          where: { id: entry.id },
          data: { status: 'APPROVED', decisionById: req.user.id },
          include: entryInclude,
        });
      }
      if (entry && placement && placement !== 'HANDED_DIRECT') {
        pkg = await prisma.package.create({
          data: {
            societyId: req.user.societyId,
            gateEntryId: entry.id,
            unitId: entry.unitId,
            partner: entry.purpose || entry.name,
            placement,
            status: 'WAITING',
          },
          include: packageInclude,
        });
        await notifyUnit(
          entry.unitId,
          req.user.societyId,
          'PACKAGE_WAITING',
          'Delivery verified at gate',
          `Package for unit ${entry.unit.unitNo} left at ${placement}`,
          '/gate',
          { entryId: entry.id, packageId: pkg.id }
        );
      }
      await notifyGuards(
        req.user.societyId,
        'VISITOR_DECISION',
        'Delivery verified by QR',
        `${entry ? entry.name : pass.purpose || 'Delivery'} for unit ${pass.unit.unitNo}`,
        '/gate',
        { entryId: entry ? entry.id : null, passId: pass.id }
      );
    }

    const resident = await resolveResident(pass.unitId);
    res.json({
      pass: decoratePass(updatedPass),
      entry: entry ? decorateEntry(entry, policy) : null,
      package: pkg,
      unit: pass.unit,
      resident,
    });
  } catch (err) {
    next(err);
  }
});

// Contact details for a given gate entry, so a guard can call the resident.
router.get('/entries/:id/resident', protect, gateAccess, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const entry = await prisma.gateEntry.findFirst({
      where: { id, societyId: req.user.societyId },
      select: { id: true, unitId: true, unit: { select: { unitNo: true } } },
    });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    const resident = await resolveResident(entry.unitId);
    res.json({ resident, unit: entry.unit });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------- Notifications --------------------------- */

router.get('/notifications', protect, async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const unread = notifications.filter((n) => !n.read).length;
    res.json({ notifications, unread });
  } catch (err) {
    next(err);
  }
});

router.post('/notifications/:id/read', protect, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.notification.updateMany({ where: { id, userId: req.user.id }, data: { read: true } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/notifications/read-all', protect, async (req, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.user.id, read: false }, data: { read: true } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
