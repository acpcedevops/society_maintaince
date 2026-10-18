const prisma = require('./prisma');

const DEFAULT_CATEGORIES = [
  'Electrician',
  'Plumber',
  'Cleaning',
  'Security',
  'Lift Maintenance',
  'Repairs',
  'Utilities',
  'Gardening',
  'Salary',
  'Other',
];

function slugCode(name) {
  const base = String(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  return base || 'SOCIETY';
}

async function generateUniqueCode(name) {
  const base = slugCode(name);
  let code = base;
  let n = 0;
  // Ensure the code is unique across societies.
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.society.findUnique({ where: { code } })) {
    n += 1;
    code = `${base}-${n}`;
  }
  return code;
}

// Usernames are globally unique so a person can be a member/admin in several
// societies. We prefer the bare phone number; when it is already taken we
// suffix it with the society code (e.g. 9999999999 -> 9999999999-green-valley).
async function generateUsername(phone, societyId) {
  const base = String(phone == null ? '' : phone).trim().toLowerCase();
  if (!base) throw new Error('A phone number is required to create a username');

  const existing = await prisma.user.findUnique({ where: { username: base } });
  if (!existing) return base;

  const society = societyId ? await prisma.society.findUnique({ where: { id: societyId } }) : null;
  const suffix = (society ? society.code : 'society').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  let candidate = `${base}-${suffix}`;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    n += 1;
    candidate = `${base}-${suffix}-${n}`;
  }
  return candidate;
}

async function createSocietyDefaults(
  societyId,
  { amount1bhk = 1200, amount2bhk = 1729, lateFeePerDay = 1, dueDay = 15, gateMode = 'GATED' } = {}
) {
  await prisma.maintenanceConfig.create({
    data: { societyId, amount1bhk, amount2bhk, lateFeePerDay, dueDay, active: true },
  });
  await prisma.securityPolicy.create({
    data: { societyId, mode: gateMode },
  });
  for (const name of DEFAULT_CATEGORIES) {
    await prisma.expenseCategory.create({ data: { societyId, name } });
  }
}

module.exports = {
  DEFAULT_CATEGORIES,
  slugCode,
  generateUniqueCode,
  generateUsername,
  createSocietyDefaults,
};
