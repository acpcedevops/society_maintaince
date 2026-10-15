const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { protect, adminOnly } = require('../middleware/auth');
const ocr = require('../services/ocr');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /image\/(jpeg|png|jpg|webp)|application\/pdf/.test(file.mimetype);
    cb(ok ? null : new Error('Only image or PDF receipts are allowed'), ok);
  },
});

const expenseSchema = z.object({
  categoryId: z.union([z.string(), z.number()]),
  vendor: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  date: z.string().optional(),
  description: z.string().optional().nullable(),
  receiptPath: z.string().optional().nullable(),
  ocrText: z.string().optional().nullable(),
});

router.get('/categories', protect, adminOnly, async (req, res, next) => {
  try {
    const categories = await prisma.expenseCategory.findMany({
      where: { societyId: req.user.societyId },
      orderBy: { name: 'asc' },
    });
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

router.post('/categories', protect, adminOnly, async (req, res, next) => {
  try {
    const data = z.object({ name: z.string().min(2) }).parse(req.body);
    const category = await prisma.expenseCategory.create({
      data: { societyId: req.user.societyId, name: data.name },
    });
    res.status(201).json({ category });
  } catch (err) {
    next(err);
  }
});

router.post('/ocr', protect, adminOnly, upload.single('receipt'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No receipt uploaded' });
    const text = await ocr.extractText(req.file.path);
    const parsed = ocr.parseReceipt(text);
    res.json({
      receiptPath: `/uploads/${req.file.filename}`,
      ocrText: text,
      parsed,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', protect, adminOnly, async (req, res, next) => {
  try {
    const { from, to, categoryId } = req.query;
    const where = { societyId: req.user.societyId };
    if (categoryId) where.categoryId = Number(categoryId);
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }
    const expenses = await prisma.expense.findMany({
      where,
      include: { category: true, createdBy: { select: { name: true } } },
      orderBy: { date: 'desc' },
    });
    res.json({ expenses });
  } catch (err) {
    next(err);
  }
});

router.post('/', protect, adminOnly, async (req, res, next) => {
  try {
    const data = expenseSchema.parse(req.body);
    const category = await prisma.expenseCategory.findFirst({
      where: { id: Number(data.categoryId), societyId: req.user.societyId },
    });
    if (!category) return res.status(400).json({ error: 'Category not found in this society' });

    const expense = await prisma.expense.create({
      data: {
        societyId: req.user.societyId,
        categoryId: category.id,
        vendor: data.vendor,
        amount: Math.round(Number(data.amount)),
        date: data.date ? new Date(data.date) : new Date(),
        description: data.description || null,
        receiptPath: data.receiptPath || null,
        ocrText: data.ocrText || null,
        createdById: req.user.id,
      },
      include: { category: true, createdBy: { select: { name: true } } },
    });
    res.status(201).json({ expense });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.expense.findFirst({ where: { id, societyId: req.user.societyId } });
    if (!existing) return res.status(404).json({ error: 'Expense not found' });
    await prisma.expense.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
