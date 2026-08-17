import { prisma } from "../lib/prisma.js";

export async function getActiveConfig() {
  return prisma.maintenanceConfig.findFirst({
    where: { active: true },
    orderBy: { effectiveFrom: "desc" },
  });
}

export function computeAmount(unit, config) {
  if (unit.amountOverride) return unit.amountOverride;
  return unit.bhk === "2BHK" ? config.amount2bhk : config.amount1bhk;
}

export function computeLateFee(bill, config, asOf = new Date()) {
  if (bill.status === "PAID" || bill.status === "PARTIAL") return bill.lateFee || 0;
  const due = new Date(bill.dueDate);
  const days = Math.floor((asOf - due) / 86400000);
  return days > 0 ? days * (config?.lateFeePerDay ?? 1) : 0;
}

export function billTotal(bill, lateFee = 0) {
  return Math.round((bill.amount + lateFee) * 100) / 100;
}

export function billKey(month, year) {
  return { month, year };
}

export function dueDateFor(month, year, day = 15) {
  return new Date(year, month - 1, day);
}

export function currentBillPeriod(now = new Date()) {
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export async function generateMonthlyBills(month, year, day = 15) {
  const config = await getActiveConfig();
  if (!config) throw Object.assign(new Error("No active maintenance configuration"), { status: 400 });

  const units = await prisma.unit.findMany({ include: { bills: true } });
  const existing = new Set(
    units.flatMap((u) => u.bills.filter((b) => b.month === month && b.year === year).map((b) => b.unitId))
  );

  const created = [];
  for (const unit of units) {
    if (existing.has(unit.id)) continue;
    const amount = computeAmount(unit, config);
    created.push(
      await prisma.bill.create({
        data: {
          unitId: unit.id,
          month,
          year,
          amount,
          status: "PENDING",
          dueDate: dueDateFor(month, year, day),
        },
      })
    );
  }
  return created;
}

export async function nextInvoiceNo(year) {
  const count = await prisma.bill.count({ where: { year } });
  return `NP-${year}-${String(count + 1).padStart(4, "0")}`;
}
