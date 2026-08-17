import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { annualReport, monthlyReport, duesReport, MONTHS, reportQuery } from "../services/report.js";

export async function getMonthly(req, res) {
  const { year, month } = reportQuery.parse(req.query);
  const report = await monthlyReport(month, year);
  res.json(report);
}

export async function getAnnual(req, res) {
  const { year } = reportQuery.parse(req.query);
  const report = await annualReport(year);
  const format = req.query.format;
  if (format === "csv") return sendAnnualCsv(res, report);
  if (format === "pdf") return sendAnnualPdf(res, report);
  res.json(report);
}

export async function getDues(req, res) {
  const { year } = reportQuery.parse(req.query);
  const report = await duesReport(year);
  const format = req.query.format;
  if (format === "csv") return sendDuesCsv(res, report);
  res.json(report);
}

export async function getDashboard(req, res) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const annual = await annualReport(year);
  const monthly = await monthlyReport(month, year);
  const recentPayments = await prisma.bill.findMany({
    where: { status: "PAID", year },
    include: { unit: true },
    orderBy: { paidAt: "desc" },
    take: 6,
  });
  const recentExpenses = await prisma.expense.findMany({
    include: { category: true },
    orderBy: { date: "desc" },
    take: 6,
  });
  const openComplaints = await prisma.complaint.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } });

  res.json({
    annual,
    monthly,
    recentPayments,
    recentExpenses,
    openComplaints,
    unitCount: await prisma.unit.count(),
    memberCount: await prisma.user.count({ where: { role: "MEMBER" } }),
  });
}

function sendAnnualCsv(res, report) {
  const lines = [
    ["Neev Plaza - Annual Audit Report"],
    [`Year`, report.year],
    [`Total Billed`, report.totalBilled],
    [`Total Collected`, report.totalCollected],
    [`Total Spent`, report.totalSpent],
    [`Outstanding`, report.outstanding],
    [],
    [`Month`, `Billed`, `Collected`, `Outstanding`],
    ...report.incomeByMonth.map((r) => [MONTHS[r.month - 1], r.billed, r.collected, r.outstanding]),
    [],
    [`Expense Category`, `Amount`],
    ...Object.entries(report.expenseByCategory),
  ];
  const csv = lines.map((l) => l.join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=annual-report-${report.year}.csv`);
  res.send(csv);
}

function sendDuesCsv(res, report) {
  const header = ["Unit", "Owner", "Contact", ...MONTHS.map((m) => m.slice(0, 3)), "Paid", "Pending"];
  const lines = [header];
  for (const u of report.units) {
    lines.push([u.unitNo, u.ownerName, u.contact, ...u.months, u.paid, u.pending]);
  }
  const csv = lines.map((l) => l.map((c) => `"${String(c ?? "")}"`).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=member-dues-${report.year}.csv`);
  res.send(csv);
}

function sendAnnualPdf(res, report) {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=annual-report-${report.year}.pdf`);

  doc.fontSize(18).font("Helvetica-Bold").text(env.societyName, { align: "center" });
  doc.fontSize(11).text(`ANNUAL AUDIT REPORT - FY ${report.year}`, { align: "center" }).moveDown();

  doc.fontSize(10).font("Helvetica");
  const summary = [
    ["Total Maintenance Billed", report.totalBilled],
    ["Total Collected from Members", report.totalCollected],
    ["Total Spent for Society", report.totalSpent],
    ["Outstanding Dues", report.outstanding],
    ["Collection Rate", `${report.collectionRate}%`],
    ["Net Surplus / (Deficit)", report.net],
  ];
  for (const [label, value] of summary) {
    doc.text(`${label.padEnd(40, " ")} Rs. ${typeof value === "string" ? value : value.toFixed(2)}`);
  }
  doc.moveDown().text("Income by Month:").moveDown(0.5);
  for (const r of report.incomeByMonth) {
    doc.fontSize(8.5).text(
      `${MONTHS[r.month - 1].padEnd(12)} Billed: Rs.${r.billed.toFixed(2).padStart(10)}   Collected: Rs.${r.collected.toFixed(2).padStart(10)}   Outstanding: Rs.${r.outstanding.toFixed(2).padStart(10)}`
    );
  }
  doc.moveDown().fontSize(10).text("Expenses by Category:").moveDown(0.5);
  doc.fontSize(8.5);
  for (const [cat, amount] of Object.entries(report.expenseByCategory)) {
    doc.text(`${cat.padEnd(30)} Rs. ${amount.toFixed(2)}`);
  }
  doc.moveDown().fontSize(8).text("Generated automatically by Neev Plaza Society Management System for audit purposes.");

  doc.end();
  doc.pipe(res);
}
