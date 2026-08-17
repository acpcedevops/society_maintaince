import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  getActiveConfig,
  generateMonthlyBills,
  nextInvoiceNo,
  currentBillPeriod,
  computeLateFee,
  billTotal,
} from "../services/billing.js";
import { isEmailConfigured, sendInvoiceEmail } from "../services/email.js";
import { billInvoiceBuffer } from "../services/invoice.js";

const listSchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().optional(),
  status: z.enum(["PENDING", "PARTIAL", "PAID", "OVERDUE", "ALL"]).optional(),
});

export async function listBills(req, res) {
  const { month, year, status } = listSchema.parse(req.query);
  const where = {};

  if (req.user.role === "MEMBER") {
    if (!req.user.unitId) return res.json({ bills: [], summary: null });
    where.unitId = req.user.unitId;
  }
  if (month && status !== "ALL") where.month = month;
  if (year) where.year = year;
  if (status && status !== "ALL") where.status = status;

  const bills = await prisma.bill.findMany({
    where,
    include: {
      unit: { include: { members: { select: { name: true, phone: true, isOwner: true } } } },
      transactions: true,
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  const { month: curM, year: curY } = currentBillPeriod();
  const config = await getActiveConfig();
  const feePerDay = config?.lateFeePerDay ?? 1;
  for (const b of bills) {
    if (b.status === "PENDING" && (b.year < curY || (b.year === curY && b.month < curM))) {
      b.status = "OVERDUE";
    }
    b.lateFee = computeLateFee(b, config);
    b.totalAmount = billTotal(b, b.lateFee);
  }

  let summary = null;
  if (status === "ALL" || (!month && !status)) {
    const paidBills = bills.filter((b) => b.status === "PAID");
    const pendingBills = bills.filter((b) => b.status === "PENDING" || b.status === "OVERDUE");
    summary = {
      totalUnits: new Set(bills.map((b) => b.unitId)).size,
      paidCount: paidBills.length,
      pendingCount: pendingBills.length,
      collected: paidBills.reduce((s, b) => s + (b.amount + (b.lateFee || 0)), 0),
      outstanding: pendingBills.reduce((s, b) => s + b.totalAmount, 0),
      feePerDay,
    };
  }
  res.json({ bills, summary });
}

const generateSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int(),
  dueDay: z.coerce.number().int().min(1).max(28).optional(),
});

export async function generate(req, res) {
  const { month, year, dueDay } = generateSchema.parse(req.body);
  const created = await generateMonthlyBills(month, year, dueDay);
  res.status(201).json({ count: created.length, bills: created });
}

const configSchema = z.object({
  name: z.string().min(2),
  amount1bhk: z.number().positive(),
  amount2bhk: z.number().positive(),
  lateFeePerDay: z.number().min(0),
  dueDay: z.number().int().min(1).max(28),
  effectiveFrom: z.string().datetime().optional(),
});

export async function upsertConfig(req, res) {
  const data = configSchema.parse(req.body);
  const existing = await getActiveConfig();
  const config = existing
    ? await prisma.maintenanceConfig.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          amount1bhk: data.amount1bhk,
          amount2bhk: data.amount2bhk,
          lateFeePerDay: data.lateFeePerDay,
          dueDay: data.dueDay,
        },
      })
    : await prisma.maintenanceConfig.create({
        data: {
          name: data.name,
          amount1bhk: data.amount1bhk,
          amount2bhk: data.amount2bhk,
          lateFeePerDay: data.lateFeePerDay,
          dueDay: data.dueDay,
          effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
        },
      });
  res.json({ config });
}

export async function getConfig(req, res) {
  const config = await getActiveConfig();
  res.json({ config });
}

export async function resendInvoice(req, res) {
  const id = Number(req.params.id);
  const bill = await prisma.bill.findUnique({
    where: { id },
    include: { unit: { include: { members: true } } },
  });
  if (!bill) return res.status(404).json({ error: "Bill not found" });
  if (bill.status !== "PAID") return res.status(400).json({ error: "Bill is not paid yet" });
  if (!isEmailConfigured()) return res.status(400).json({ error: "SMTP not configured. Set SMTP_HOST in server/.env first." });

  const owner = bill.unit.members.find((m) => m.isOwner) || bill.unit.members[0];
  if (!owner?.email) return res.status(400).json({ error: "Owner has no email on file" });

  const pdfBuffer = await billInvoiceBuffer(bill.id);
  const info = await sendInvoiceEmail({ to: owner.email, invoiceNo: bill.invoiceNo, bill, pdfBuffer });
  res.json({ sent: true, to: owner.email, messageId: info.messageId });
}

const offlinePaymentSchema = z.object({
  billId: z.number().int().positive(),
  amount: z.number().positive().optional(),
  method: z.enum(["CASH", "CHEQUE", "UPI", "BANK_TRANSFER", "OTHER"]).default("CASH"),
  paidDate: z.string().datetime().optional(),
});

export async function recordOfflinePayment(req, res) {
  const { billId, amount, method, paidDate } = offlinePaymentSchema.parse(req.body);
  const bill = await prisma.bill.findUnique({ where: { id: billId }, include: { unit: true } });
  if (!bill) return res.status(404).json({ error: "Bill not found" });
  if (bill.status === "PAID") return res.status(400).json({ error: "Bill already paid" });

  const config = await getActiveConfig();
  const paidAt = paidDate ? new Date(paidDate) : new Date();
  const lateFee = computeLateFee(bill, config, paidAt);
  const total = billTotal(bill, lateFee);
  const paidAmount = amount || total;
  const isFull = paidAmount >= total;

  const updated = await prisma.bill.update({
    where: { id: bill.id },
    data: {
      status: isFull ? "PAID" : "PARTIAL",
      paidAt,
      lateFee,
      paymentMethod: method,
      invoiceNo: bill.invoiceNo || (await nextInvoiceNo(bill.year)),
    },
  });

  await prisma.paymentTransaction.create({
    data: {
      billId: bill.id,
      amount: paidAmount,
      method,
      status: "PAID",
    },
  });

  if (updated.status === "PAID" && isEmailConfigured()) {
    try {
      const full = await prisma.bill.findUnique({
        where: { id: bill.id },
        include: { unit: { include: { members: true } } },
      });
      const owner = full?.unit?.members.find((m) => m.isOwner) || full?.unit?.members[0];
      if (owner?.email) {
        const pdfBuffer = await billInvoiceBuffer(bill.id);
        await sendInvoiceEmail({ to: owner.email, invoiceNo: full.invoiceNo, bill: full, pdfBuffer });
      }
    } catch (err) {
      console.error("[email] Failed to send invoice:", err.message);
    }
  }

  res.json({ bill: updated });
}

export async function getBillsByMonth(req, res) {
  const month = Number(req.params.month);
  const year = Number(req.params.year) || new Date().getFullYear();
  const bills = await prisma.bill.findMany({
    where: { month, year },
    include: {
      unit: { include: { members: { select: { name: true, phone: true, isOwner: true } } } },
    },
    orderBy: { unit: { unitNo: "asc" } },
  });
  const config = await getActiveConfig();
  for (const b of bills) {
    b.lateFee = computeLateFee(b, config);
    b.totalAmount = billTotal(b, b.lateFee);
  }
  const collected = bills.filter((b) => b.status === "PAID").reduce((s, b) => s + (b.amount + (b.lateFee || 0)), 0);
  const pending = bills.filter((b) => b.status !== "PAID").reduce((s, b) => s + b.totalAmount, 0);
  res.json({
    month,
    year,
    bills,
    summary: { totalBills: bills.length, paid: bills.filter((b) => b.status === "PAID").length, collected, pending },
  });
}
