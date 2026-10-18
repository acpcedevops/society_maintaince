const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { sign } = require('../lib/jwt');
const { protect } = require('../middleware/auth');
const { publicUser } = require('../lib/serialize');
const { generateUniqueCode, generateUsername, createSocietyDefaults } = require('../lib/society');
const { sendMail } = require('../lib/mailer');

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
  username: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function notifyAdminsPending(societyId, user) {
  const admins = await prisma.user.findMany({
    where: { societyId, role: 'ADMIN', status: 'APPROVED' },
    select: { id: true },
  });
  for (const admin of admins) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.notification.create({
      data: {
        societyId,
        userId: admin.id,
        type: 'GENERAL',
        title: 'New member awaiting approval',
        body: `${user.name}${user.unit ? ` (Unit ${user.unit.unitNo})` : ''} requested to join.`,
        link: '/members',
        meta: { memberId: user.id },
      },
    });
  }
}

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
      data: { name: data.societyName, code, address: data.societyAddress || null, status: 'PENDING' },
    });
    await createSocietyDefaults(society.id);

    const user = await prisma.user.create({
      data: {
        societyId: society.id,
        name: data.name,
        phone: data.phone,
        username: await generateUsername(data.phone, society.id),
        email: data.email || null,
        passwordHash: await bcrypt.hash(data.password, 10),
        role: 'ADMIN',
        status: 'PENDING',
        isOwner: false,
      },
      include: userInclude,
    });

    res.status(201).json({
      pending: true,
      message:
        'Your society was submitted for review. A platform administrator must approve it before you can log in.',
      society: { id: society.id, name: society.name, code: society.code },
      user: publicUser(user),
    });
  } catch (err) {
    next(err);
  }
});

// Join an existing society as a member. Self-registered members start PENDING
// and cannot log in until an admin approves them.
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
    if (society.status !== 'APPROVED') {
      return res.status(400).json({ error: 'This society is not accepting registrations yet.' });
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
        username: await generateUsername(data.phone, society.id),
        email: data.email || null,
        passwordHash: await bcrypt.hash(data.password, 10),
        role: 'MEMBER',
        status: 'PENDING',
        unitId,
        isOwner: true,
      },
      include: userInclude,
    });

    await notifyAdminsPending(society.id, user);

    res.status(201).json({
      pending: true,
      message: 'Your registration was received. A society admin must approve your account before you can log in.',
      user: publicUser(user),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const login = loginSchema.parse(req.body);
    const { password } = login;
    const username = String(login.username || login.phone || '').trim().toLowerCase();
    if (!username) {
      return res.status(400).json({ error: 'Please enter your username' });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      include: userInclude,
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    if (user.society && user.society.status === 'REJECTED') {
      return res.status(403).json({ error: 'Your society registration was not approved by the platform.' });
    }
    if (user.society && user.society.status === 'PENDING') {
      return res.status(403).json({ error: 'Your society is awaiting platform approval. Please check back soon.' });
    }
    if (user.status === 'PENDING') {
      return res.status(403).json({ error: 'Your account is awaiting admin approval.' });
    }
    if (user.status === 'REJECTED') {
      return res.status(403).json({ error: 'Your registration was not approved. Please contact your society admin.' });
    }
    res.json({ token: sign(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// Request a password-reset link. Available to every role (member / admin / guard).
router.post('/forgot-password', async (req, res, next) => {
  try {
    const data = z
      .object({
        societyId: z.union([z.string(), z.number()]).optional(),
        societyCode: z.string().optional(),
        email: z.string().email(),
      })
      .parse(req.body);

    const generic = {
      ok: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    };

    const society = await resolveSociety(data);
    if (!society) return res.json(generic);

    const user = await prisma.user.findFirst({
      where: { societyId: society.id, email: data.email },
      include: { society: true },
    });
    if (!user) return res.json(generic);

    const raw = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(raw);

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const base = (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const link = `${base}/reset-password?token=${raw}`;
    const subject = 'Reset your Society Portal password';
    const text =
      `Hello ${user.name},\n\n` +
      `We received a request to reset your password for ${society.name}.\n\n` +
      `Open the link below to choose a new password (valid for 1 hour):\n${link}\n\n` +
      `If you did not request this, you can safely ignore this email.`;
    const html =
      `<p>Hello ${escapeHtml(user.name)},</p>` +
      `<p>We received a request to reset your password for <strong>${escapeHtml(society.name)}</strong>.</p>` +
      `<p><a href="${link}">Choose a new password</a> (valid for 1 hour).</p>` +
      `<p>If you did not request this, you can safely ignore this email.</p>`;

    await sendMail({ to: user.email, subject, text, html });
    res.json(generic);
  } catch (err) {
    next(err);
  }
});

// Validate a reset token before showing the form.
router.get('/reset-password', async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().min(10) }).parse(req.query);
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
    const valid = Boolean(record && !record.usedAt && record.expiresAt.getTime() > Date.now());
    res.json({ valid });
  } catch (err) {
    next(err);
  }
});

// Set a new password using a valid reset token.
router.post('/reset-password', async (req, res, next) => {
  try {
    const data = z
      .object({ token: z.string().min(10), password: z.string().min(6) })
      .parse(req.body);

    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(data.token) } });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    }

    await prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await bcrypt.hash(data.password, 10) },
    });
    await prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

    res.json({ ok: true, message: 'Your password has been reset. You can now log in.' });
  } catch (err) {
    next(err);
  }
});

router.get('/me', protect, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
