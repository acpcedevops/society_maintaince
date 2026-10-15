const express = require('express');
const prisma = require('../lib/prisma');
const { protect, adminOnly } = require('../middleware/auth');
const { decorateBill, getActiveConfig } = require('../lib/billing');

const router = express.Router();

router.get('/dashboard', protect, adminOnly, async (req, res, next) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const config = await getActiveConfig(req.user.societyId);
    const now = new Date();

    const bills = await prisma.bill.findMany({
      where: { year, unit: { societyId: req.user.societyId } },
      include: { transactions: true, unit: true },
    });

    const expenses = await prisma.expense.findMany({
      where: {
        societyId: req.user.societyId,
        date: {
          gte: new Date(Date.UTC(year, 0, 1) - 5.5 * 3600 * 1000),
          lt: new Date(Date.UTC(year + 1, 0, 1) - 5.5 * 3600 * 1000),
        },
      },
      include: { category: true },
    });

    const incomeByMonth = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      billed: 0,
      collected: 0,
      outstanding: 0,
    }));
    const expenseByMonth = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      count: 0,
      amount: 0,
    }));

    let totalBilled = 0;
    let totalCollected = 0;

    for (const bill of bills) {
      const decorated = decorateBill(bill, config, now);
      const billed = decorated.totalAmount;
      const collected = bill.transactions.reduce((s, t) => s + (t.status === 'PAID' ? t.amount : 0), 0);
      totalBilled += billed;
      totalCollected += collected;
      const row = incomeByMonth[bill.month - 1];
      row.billed += billed;
      row.collected += collected;
    }
    for (const row of incomeByMonth) {
      row.outstanding = row.billed - row.collected;
    }

    let totalSpent = 0;
    const byCategory = {};
    for (const expense of expenses) {
      totalSpent += expense.amount;
      expenseByMonth[expense.date.getUTCMonth()].count += 1;
      expenseByMonth[expense.date.getUTCMonth()].amount += expense.amount;
      const name = expense.category ? expense.category.name : 'Other';
      byCategory[name] = (byCategory[name] || 0) + expense.amount;
    }

    const outstanding = totalBilled - totalCollected;
    const net = totalCollected - totalSpent;
    const collectionRate = totalBilled ? Math.round((totalCollected / totalBilled) * 100) : 0;

    res.json({
      annual: {
        year,
        totalCollected,
        totalBilled,
        totalSpent,
        outstanding,
        net,
        collectionRate,
        incomeByMonth,
        expenseByMonth,
        expenseByCategory: Object.entries(byCategory).map(([category, amount]) => ({ category, amount })),
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
