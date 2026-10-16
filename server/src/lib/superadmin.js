const bcrypt = require('bcryptjs');
const prisma = require('./prisma');

// Creates or refreshes the platform (super) admin from environment variables.
// Configured once per deploy; the password is only rewritten when it differs so
// we do not churn the hash on every boot.
async function bootstrapSuperAdmin() {
  const email = (process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD || '';
  if (!email || !password) {
    console.warn('[superadmin] SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD not set — platform admin disabled.');
    return null;
  }

  const name = (process.env.SUPERADMIN_NAME || 'Platform Admin').trim();
  const phone = (process.env.SUPERADMIN_PHONE || '').trim() || null;

  const existing = await prisma.superAdmin.findUnique({ where: { email } });
  if (!existing) {
    const admin = await prisma.superAdmin.create({
      data: { name, email, phone, passwordHash: await bcrypt.hash(password, 10) },
    });
    console.log(`[superadmin] created platform admin ${email}`);
    return admin;
  }

  const samePassword = await bcrypt.compare(password, existing.passwordHash);
  if (!samePassword || existing.name !== name || existing.phone !== phone) {
    const admin = await prisma.superAdmin.update({
      where: { id: existing.id },
      data: {
        name,
        phone,
        ...(samePassword ? {} : { passwordHash: await bcrypt.hash(password, 10) }),
      },
    });
    console.log(`[superadmin] updated platform admin ${email}`);
    return admin;
  }

  return existing;
}

module.exports = { bootstrapSuperAdmin };
