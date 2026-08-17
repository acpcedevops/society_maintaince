import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ocrReceipt, parseReceipt } from "../services/ocr.js";

const expenseSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  vendor: z.string().min(2),
  amount: z.coerce.number().positive(),
  date: z.string().optional().nullable(),
  description: z.string().optional().or(z.literal("")),
  receiptPath: z.string().optional().or(z.literal("")).nullable(),
  ocrText: z.string().optional().or(z.literal("")).nullable(),
});

export async function listCategories(req, res) {
  const categories = await prisma.expenseCategory.findMany({ orderBy: { name: "asc" } });
  res.json({ categories });
}

export async function listExpenses(req, res) {
  const { month, year, categoryId } = req.query;
  const where = {};
  if (month && year) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    where.date = { gte: start, lt: end };
  } else if (year) {
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    where.date = { gte: start, lt: end };
  }
  if (categoryId) where.categoryId = Number(categoryId);

  const expenses = await prisma.expense.findMany({
    where,
    include: { category: true, createdBy: { select: { name: true } } },
    orderBy: { date: "desc" },
  });
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  res.json({ expenses, total });
}

export async function createExpense(req, res) {
  const data = expenseSchema.parse({ ...req.body, ocrText: req.body.ocrText || null });
  const expense = await prisma.expense.create({
    data: {
      ...data,
      date: data.date ? new Date(data.date) : new Date(),
      receiptPath: req.body.receiptPath || req.file?.filename || null,
      createdById: req.user.id,
    },
    include: { category: true },
  });
  res.status(201).json({ expense });
}

export async function updateExpense(req, res) {
  const id = Number(req.params.id);
  const data = expenseSchema.partial().parse(req.body);
  const expense = await prisma.expense.update({
    where: { id },
    data: { ...data, date: data.date ? new Date(data.date) : undefined },
    include: { category: true },
  });
  res.json({ expense });
}

export async function deleteExpense(req, res) {
  const id = Number(req.params.id);
  await prisma.expense.delete({ where: { id } });
  res.json({ ok: true });
}

export async function ocrUpload(req, res) {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const { text, confidence } = await ocrReceipt(req.file.path);
  const parsed = parseReceipt(text);
  res.json({
    text,
    confidence,
    parsed: {
      amount: parsed.amount,
      vendor: parsed.vendor,
      date: parsed.date,
    },
    receiptPath: req.file.filename,
  });
}
