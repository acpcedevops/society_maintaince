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
  createSocietyDefaults,
};
