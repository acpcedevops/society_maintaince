import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getActiveConfig, computeLateFee } from "./billing.js";

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export function yearRange(year) {
  return { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) };
}

export async function monthlyReport(month, year) {
  const bills = await prisma.bill.findMany({
    where: { month, year },
    include: { unit: true },
  });
  const expenses = await prisma.expense.findMany({
    where: { date: { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) } },
    include: { category: true },
  });

  const collected = bills.filter((b) => b.status === "PAID").reduce((s, b) => s + b.amount + (b.lateFee || 0), 0);
  const outstanding = bills.filter((b) => b.status !== "PAID").reduce((s, b) => s + b.amount + (b.lateFee || 0), 0);
  const spent = expenses.reduce((s, e) => s + e.amount, 0);

  const byCategory = {};
  for (const e of expenses) {
    byCategory[e.category.name] = (byCategory[e.category.name] || 0) + e.amount;
  }

  return {
    period: `${MONTHS[month - 1]} ${year}`,
    income: { collected, outstanding, paidUnits: bills.filter((b) => b.status === "PAID").length, totalUnits: bills.length },
    expenses: { spent, total: expenses.length, byCategory },
    net: collected - spent,
  };
}

export async function annualReport(year) {
  const income = await prisma.bill.findMany({ where: { year } });
  const expenses = await prisma.expense.findMany({
    where: { date: yearRange(year) },
    include: { category: true },
  });

  const incomeByMonth = Array.from({ length: 12 }, (_, i) => {
    const bs = income.filter((b) => b.month === i + 1);
    return {
      month: i + 1,
      billed: bs.reduce((s, b) => s + b.amount, 0),
      collected: bs.filter((b) => b.status === "PAID").reduce((s, b) => s + b.amount + (b.lateFee || 0), 0),
      outstanding: bs.filter((b) => b.status !== "PAID").reduce((s, b) => s + b.amount + (b.lateFee || 0), 0),
    };
  });

  const expenseByMonth = Array.from({ length: 12 }, (_, i) => {
    const es = expenses.filter((e) => e.date.getMonth() === i);
    return { month: i + 1, count: es.length, amount: es.reduce((s, e) => s + e.amount, 0) };
  });

  const byCategory = {};
  for (const e of expenses) {
    byCategory[e.category.name] = (byCategory[e.category.name] || 0) + e.amount;
  }

  const totalCollected = income.filter((b) => b.status === "PAID").reduce((s, b) => s + b.amount + (b.lateFee || 0), 0);
  const totalBilled = income.reduce((s, b) => s + b.amount, 0);
  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  const outstanding = totalBilled - totalCollected;

  return {
    year,
    totalCollected,
    totalBilled,
    totalSpent,
    outstanding,
    net: totalCollected - totalSpent,
    collectionRate: totalBilled ? Math.round((totalCollected / totalBilled) * 100) : 0,
    incomeByMonth,
    expenseByMonth,
    expenseByCategory: byCategory,
    expenseCount: expenses.length,
  };
}

export async function duesReport(year) {
  const bills = await prisma.bill.findMany({
    where: { year },
    include: { unit: { include: { members: { select: { name: true, phone: true, isOwner: true } } } } },
    orderBy: { unit: { unitNo: "asc" } },
  });
  const config = await getActiveConfig();

  const rows = {};
  for (const b of bills) {
    if (!rows[b.unitId]) {
      const owner = b.unit.members.find((m) => m.isOwner) || b.unit.members[0];
      rows[b.unitId] = {
        unitNo: b.unit.unitNo,
        ownerName: b.unit.ownerName,
        contact: owner?.phone || "—",
        months: {},
        paid: 0,
        pending: 0,
        total: 0,
      };
    }
    const row = rows[b.unitId];
    row.total += b.amount;
    if (b.status === "PAID") {
      row.paid += b.amount + (b.lateFee || 0);
      row.months[b.month] = "PAID";
    } else {
      const lateFee = computeLateFee(b, config);
      row.pending += b.amount + lateFee;
      row.months[b.month] = lateFee > 0 ? `PENDING +${lateFee}` : (b.status === "PARTIAL" ? "PARTIAL" : "PENDING");
    }
  }
  return {
    year,
    units: Object.values(rows).map((r) => ({
      ...r,
      months: Array.from({ length: 12 }, (_, i) => r.months[i + 1] || null),
    })),
  };
}

const reportQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()),
  month: z.coerce.number().int().min(1).max(12).optional(),
});
export { reportQuery, MONTHS };
