const prisma = require('./prisma');

const IST_OFFSET = 5.5 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000; // re-check every 3 hours

function dueDateFor(year, month, dueDay) {
  return new Date(Date.UTC(year, month - 1, dueDay) - IST_OFFSET);
}

function istDayIndex(date) {
  return Math.floor((date.getTime() + IST_OFFSET) / DAY);
}

function daysOverdue(dueDate, now) {
  return istDayIndex(now) - istDayIndex(dueDate);
}

function expectedAmount(unit, config) {
  if (unit.amountOverride != null) return unit.amountOverride;
  return unit.bhk === '2BHK' ? config.amount2bhk : config.amount1bhk;
}

function decorateBill(bill, config, now = new Date()) {
  let lateFee = bill.lateFee || 0;
  let status = bill.status;
  const unpaid = status !== 'PAID';
  if (unpaid && now > bill.dueDate) {
    const overdue = Math.max(0, daysOverdue(bill.dueDate, now));
    lateFee = overdue * (config ? config.lateFeePerDay : 1);
    status = 'OVERDUE';
  }
  return {
    ...bill,
    lateFee,
    status,
    isOverdue: status === 'OVERDUE',
    totalAmount: bill.amount + lateFee,
  };
}

async function getActiveConfig(societyId) {
  return prisma.maintenanceConfig.findFirst({
    where: { active: true, ...(societyId ? { societyId } : {}) },
    orderBy: { createdAt: 'desc' },
  });
}

// Current calendar month/year in IST.
function istYearMonth(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() + 1 };
}

function nextMonth(year, month) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

// Create bills for every unit in a society that is missing one for the given
// month/year. Skips units that already have a bill, so it is safe to re-run.
async function generateBillsForMonth(societyId, month, year, config) {
  const cfg = config || (await getActiveConfig(societyId));
  if (!cfg) return { created: 0, skipped: 0 };

  const units = await prisma.unit.findMany({ where: { societyId } });
  const dueDate = dueDateFor(year, month, cfg.dueDay);
  let created = 0;
  let skipped = 0;

  for (const unit of units) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await prisma.bill.findUnique({
      where: { unitId_month_year: { unitId: unit.id, month, year } },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await prisma.bill.create({
      data: {
        unitId: unit.id,
        month,
        year,
        amount: expectedAmount(unit, cfg),
        lateFee: 0,
        status: 'PENDING',
        dueDate,
      },
    });
    created += 1;
  }
  return { created, skipped };
}

// For each approved society with an active config, generate bills for every
// month from the one after its latest bill up to the current month.
async function runMonthlyBilling(now = new Date()) {
  const { year: curYear, month: curMonth } = istYearMonth(now);
  const societies = await prisma.society.findMany({
    where: { status: 'APPROVED' },
    select: { id: true, name: true },
  });

  const summary = [];
  for (const society of societies) {
    // eslint-disable-next-line no-await-in-loop
    const config = await getActiveConfig(society.id);
    if (!config) continue;

    // eslint-disable-next-line no-await-in-loop
    const latest = await prisma.bill.findFirst({
      where: { unit: { societyId: society.id } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: { year: true, month: true },
    });

    let cursor = latest ? nextMonth(latest.year, latest.month) : { year: curYear, month: curMonth };

    let created = 0;
    let skipped = 0;
    let guard = 0;
    while ((cursor.year < curYear || (cursor.year === curYear && cursor.month <= curMonth)) && guard < 24) {
      // eslint-disable-next-line no-await-in-loop
      const result = await generateBillsForMonth(society.id, cursor.month, cursor.year, config);
      created += result.created;
      skipped += result.skipped;
      cursor = nextMonth(cursor.year, cursor.month);
      guard += 1;
    }

    if (created > 0) {
      summary.push({ societyId: society.id, society: society.name, created, skipped });
    }
  }
  return summary;
}

// Run at startup and then periodically, so a new month's bills appear on each
// society's member dashboards automatically.
function startBillingScheduler() {
  const run = () =>
    runMonthlyBilling()
      .then((summary) => {
        const total = summary.reduce((n, s) => n + s.created, 0);
        if (total > 0) {
          console.log(
            `[billing] generated ${total} bill(s): ${summary.map((s) => `${s.society} +${s.created}`).join(', ')}`
          );
        }
      })
      .catch((err) => console.error('[billing] monthly run failed:', err.message));

  run();
  setInterval(run, CHECK_INTERVAL_MS).unref();
}

module.exports = {
  IST_OFFSET,
  dueDateFor,
  istDayIndex,
  daysOverdue,
  expectedAmount,
  decorateBill,
  getActiveConfig,
  istYearMonth,
  generateBillsForMonth,
  runMonthlyBilling,
  startBillingScheduler,
};
