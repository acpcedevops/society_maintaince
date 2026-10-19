const prisma = require('./prisma');
const { decorateBill, getActiveConfig } = require('./billing');

// Records the intent to collect `amount` against a gateway order, with one
// allocation row per bill. Idempotent on gatewayOrderId: concurrent/repeated
// calls return the already-recorded payment.
async function recordPayment({
  societyId,
  gatewayOrderId,
  amount,
  allocations,
  method = 'ONLINE',
  demo = false,
}) {
  const existing = await prisma.payment.findUnique({
    where: { gatewayOrderId },
    include: { allocations: true },
  });
  if (existing) return existing;
  return prisma.payment.create({
    data: {
      societyId,
      gatewayOrderId,
      amount,
      method,
      demo,
      status: 'CREATED',
      allocations: {
        create: allocations.map((a) => ({ billId: a.billId, amount: a.amount })),
      },
    },
    include: { allocations: true },
  });
}

// Atomically settles a recorded payment:
//   1. Claims the CREATED -> PAID transition once (updateMany guard), so
//      concurrent webhook + verify calls can never settle twice.
//   2. For each allocation, flips the bill PAID only if it is still unpaid
//      (updateMany guard) and writes exactly one Transaction history row.
//   3. Bills outside `societyId` (when given) are never touched.
// Safe to call repeatedly and concurrently.
async function settlePayment({ gatewayOrderId, gatewayPaymentId = null, societyId = null }) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { gatewayOrderId },
      include: { allocations: { include: { bill: { include: { unit: true } } } } },
    });
    if (!payment) return { ok: false, reason: 'not_recorded' };
    if (societyId && payment.societyId !== societyId) {
      // Do not leak other societies' payment records.
      return { ok: false, reason: 'not_found' };
    }

    const allocationBillIds = payment.allocations.map((a) => a.billId);
    if (payment.status === 'PAID') {
      return { ok: true, alreadyPaid: true, paymentId: payment.id, billIds: allocationBillIds };
    }

    // Claim the settlement slot: only one caller wins this transition.
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: 'CREATED' },
      data: {
        status: 'PAID',
        gatewayPaymentId: gatewayPaymentId || payment.gatewayPaymentId,
        paidAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      return { ok: true, alreadyPaid: true, paymentId: payment.id, billIds: allocationBillIds };
    }

    const billIds = [];
    for (const alloc of payment.allocations) {
      const bill = alloc.bill;
      if (societyId && bill.unit.societyId !== societyId) continue;

      const flipped = await tx.bill.updateMany({
        where: { id: bill.id, status: { not: 'PAID' } },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paymentMethod: payment.method,
          gatewayPaymentId: gatewayPaymentId || bill.gatewayPaymentId,
        },
      });
      // Only the caller that actually flipped the bill writes its history
      // row — this is what prevents duplicate allocations when an offline
      // payment or a concurrent settle already covered the bill.
      if (flipped.count === 1) {
        await tx.transaction.create({
          data: {
            billId: bill.id,
            amount: alloc.amount,
            method: payment.method,
            gatewayOrderId: payment.gatewayOrderId,
            gatewayPaymentId,
            status: 'PAID',
          },
        });
      }
      billIds.push(bill.id);
    }

    return { ok: true, paymentId: payment.id, billIds };
  });
}

// Rebuilds per-bill amounts for an order that has no Payment row yet (legacy
// orders created before payments were recorded). Prefers the amounts frozen
// into order tags at creation time; otherwise recomputes the decorated total.
async function recoverAllocationsFromOrder(order, parseBillIds) {
  const billIds = parseBillIds(order?.order_tags?.bill_ids || order?.order_note);
  if (!billIds.length) return { societyId: null, allocations: [], total: 0 };

  const tagged = String(order?.order_tags?.bill_amounts || '');
  const amountById = new Map();
  for (const pair of tagged.split(',')) {
    const [id, amt] = pair.split(':').map(Number);
    if (Number.isFinite(id) && Number.isFinite(amt)) amountById.set(id, amt);
  }

  const bills = await prisma.bill.findMany({
    where: { id: { in: billIds } },
    include: { unit: { select: { societyId: true } } },
  });
  const byId = new Map(bills.map((b) => [b.id, b]));

  const allocations = [];
  let societyId = null;
  for (const id of billIds) {
    const bill = byId.get(id);
    if (!bill) continue;
    societyId = societyId || bill.unit.societyId;
    let amount = amountById.get(id);
    if (!Number.isFinite(amount)) {
      const config = await getActiveConfig(bill.unit.societyId);
      amount = bill.amount + (decorateBill(bill, config).lateFee || 0);
    }
    allocations.push({ billId: id, amount });
  }
  const total = allocations.reduce((s, a) => s + a.amount, 0);
  return { societyId, allocations, total };
}

module.exports = { recordPayment, settlePayment, recoverAllocationsFromOrder };
