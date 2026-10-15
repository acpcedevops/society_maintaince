const prisma = require('./prisma');

const IST_OFFSET = 5.5 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

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

module.exports = {
  IST_OFFSET,
  dueDateFor,
  istDayIndex,
  daysOverdue,
  expectedAmount,
  decorateBill,
  getActiveConfig,
};
