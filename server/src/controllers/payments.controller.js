import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { razorpay, verifyPaymentSignature, verifyWebhookSignature, isRazorpayConfigured } from "../services/razorpay.js";
import { nextInvoiceNo, getActiveConfig, computeLateFee, billTotal } from "../services/billing.js";
import { isEmailConfigured, sendInvoiceEmail } from "../services/email.js";
import { billInvoiceBuffer } from "../services/invoice.js";

const createOrderSchema = z.object({
  billId: z.number().int().positive(),
});

export async function createOrder(req, res) {
  const { billId } = createOrderSchema.parse(req.body);
  const bill = await prisma.bill.findFirst({
    where: { id: billId, unitId: req.user.unitId },
    include: { unit: true },
  });
  if (!bill) return res.status(404).json({ error: "Bill not found for your unit" });
  if (bill.status === "PAID") return res.status(400).json({ error: "Bill already paid" });

  if (!isRazorpayConfigured()) {
    return res.status(400).json({
      error: "Razorpay is not configured with live/test keys. Contact admin.",
      mock: true,
    });
  }

  const config = await getActiveConfig();
  const lateFee = computeLateFee(bill, config);
  const total = billTotal(bill, lateFee);

  const order = await razorpay.orders.create({
    amount: Math.round(total * 100),
    currency: "INR",
    receipt: `bill_${bill.id}`,
    notes: { billId: bill.id, unitNo: bill.unit.unitNo, month: bill.month, year: bill.year },
  });

  await prisma.paymentTransaction.create({
    data: {
      billId: bill.id,
      amount: total,
      razorpayOrderId: order.id,
      status: "PENDING",
    },
  });

  res.json({
    keyId: env.razorpayKeyId,
    orderId: order.id,
    amount: total,
    baseAmount: bill.amount,
    lateFee,
    currency: "INR",
    bill,
  });
}

export async function mockPayment(req, res) {
  const { billId } = createOrderSchema.parse(req.body);
  if (isRazorpayConfigured()) return res.status(400).json({ error: "Real gateway active - use actual Razorpay checkout" });
  const bill = await prisma.bill.findFirst({ where: { id: billId, unitId: req.user.unitId } });
  if (!bill) return res.status(404).json({ error: "Bill not found for your unit" });
  if (bill.status === "PAID") return res.status(400).json({ error: "Bill already paid" });
  await prisma.paymentTransaction.create({
    data: { billId: bill.id, amount: bill.amount, method: "ONLINE", status: "PAID" },
  });
  const updated = await markBillPaid(bill.id, { orderId: "mock", paymentId: "mock_pay_" + Date.now(), method: "ONLINE" });
  res.json({ bill: updated, paid: true, mock: true });
}

const verifySchema = z.object({
  billId: z.number().int().positive(),
  orderId: z.string(),
  paymentId: z.string(),
  signature: z.string(),
});

export async function verifyPayment(req, res) {
  const { billId, orderId, paymentId, signature } = verifySchema.parse(req.body);
  if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
    return res.status(400).json({ error: "Payment signature verification failed" });
  }
  const bill = await markBillPaid(billId, { orderId, paymentId, method: "ONLINE" });
  res.json({ bill, paid: true });
}

export async function razorpayWebhook(req, res) {
  try {
    const signature = req.headers["x-razorpay-signature"];
    if (!signature || !verifyWebhookSignature(req.rawBody, signature)) {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }
    const event = req.body;
    if (event.event === "payment.captured" || event.event === "order.paid") {
      const payload = event.payload?.payment?.entity || event.payload?.order?.entity;
      if (payload) {
        const orderId = payload.order_id || payload.id;
        const paymentId = payload.id;
        const notes = payload.notes || {};
        const billId = Number(notes.billId);
        const receipt = String(payload.receipt || "");
        const m = receipt.match(/bill_(\d+)/);
        const resolvedBillId = billId || (m ? Number(m[1]) : null);
        if (resolvedBillId) {
          const tx = await prisma.paymentTransaction.findFirst({
            where: { billId: resolvedBillId, razorpayOrderId: orderId },
          });
          if (!tx) {
            const bill = await prisma.bill.findUnique({ where: { id: resolvedBillId } });
            if (bill) await prisma.paymentTransaction.create({
              data: { billId: bill.id, amount: bill.amount, razorpayOrderId: orderId, razorpayPaymentId: paymentId, method: "ONLINE", status: "PAID" },
            });
          } else {
            await prisma.paymentTransaction.update({ where: { id: tx.id }, data: { status: "PAID", razorpayPaymentId: paymentId } });
          }
          await markBillPaid(resolvedBillId, { orderId, paymentId, method: "ONLINE" });
        }
      }
    }
  } catch (err) {
    console.error("Webhook processing error:", err.message);
  }
  res.json({ received: true });
}

async function markBillPaid(billId, { orderId, paymentId, method }) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { unit: { include: { members: true } } },
  });
  if (!bill) throw Object.assign(new Error("Bill not found"), { status: 404 });

  let invoiceNo = bill.invoiceNo;
  if (bill.status !== "PAID") {
    const config = await getActiveConfig();
    const lateFee = computeLateFee(bill, config);
    invoiceNo = bill.invoiceNo || (await nextInvoiceNo(bill.year));
    await prisma.bill.update({
      where: { id: bill.id },
      data: { status: "PAID", paidAt: new Date(), lateFee, paymentMethod: method, razorpayPaymentId: paymentId, invoiceNo },
    });
    await prisma.paymentTransaction.updateMany({
      where: { billId: bill.id, razorpayOrderId: orderId },
      data: { status: "PAID", razorpayPaymentId: paymentId },
    });
  }

  const updated = await prisma.bill.findUnique({ where: { id: billId }, include: { unit: true } });
  await emailInvoiceForBill(billId);
  return updated;
}

async function emailInvoiceForBill(billId) {
  if (!isEmailConfigured()) return;
  try {
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: { unit: { include: { members: true } } },
    });
    const owner = bill?.unit?.members.find((m) => m.isOwner) || bill?.unit?.members[0];
    if (!owner?.email) return;
    const pdfBuffer = await billInvoiceBuffer(bill.id);
    await sendInvoiceEmail({ to: owner.email, invoiceNo: bill.invoiceNo, bill, pdfBuffer });
  } catch (err) {
    console.error("[email] Failed to send invoice:", err.message);
  }
}

export { markBillPaid };

const createBulkOrderSchema = z.object({
  billIds: z.array(z.number().int().positive()).min(2).max(12),
});

export async function createBulkOrder(req, res) {
  const { billIds } = createBulkOrderSchema.parse(req.body);
  const bills = await prisma.bill.findMany({
    where: { id: { in: billIds }, unitId: req.user.unitId, status: { not: "PAID" } },
    include: { unit: true },
  });
  if (bills.length === 0) return res.status(400).json({ error: "No pending bills found for the selected IDs" });
  if (bills.length !== billIds.length) {
    const found = bills.map((b) => b.id);
    const missing = billIds.filter((id) => !found.includes(id));
    return res.status(400).json({ error: `Some bills not found or already paid: ${missing.join(", ")}` });
  }

  if (!isRazorpayConfigured()) {
    return res.status(400).json({ error: "Razorpay is not configured. Contact admin.", mock: true });
  }

  const config = await getActiveConfig();
  let total = 0;
  const billDetails = bills.map((b) => {
    const lateFee = computeLateFee(b, config);
    const t = billTotal(b, lateFee);
    total += t;
    return { id: b.id, month: b.month, year: b.year, amount: b.amount, lateFee, total: t, unitNo: b.unit.unitNo };
  });
  total = Math.round(total * 100) / 100;

  const receipt = `bulk_${bills.map((b) => b.id).join("_")}`;
  const order = await razorpay.orders.create({
    amount: Math.round(total * 100),
    currency: "INR",
    receipt,
    notes: {
      billIds: bills.map((b) => b.id).join(","),
      unitNo: bills[0].unit.unitNo,
      months: bills.map((b) => `${b.month}/${b.year}`).join(", "),
    },
  });

  for (const b of billDetails) {
    await prisma.paymentTransaction.create({
      data: { billId: b.id, amount: b.total, razorpayOrderId: order.id, status: "PENDING" },
    });
  }

  res.json({
    keyId: env.razorpayKeyId,
    orderId: order.id,
    amount: total,
    currency: "INR",
    bills: billDetails,
    months: billDetails.map((b) => `${monthName(b.month)} ${b.year}`).join(", "),
  });
}

export async function verifyBulkPayment(req, res) {
  const { billIds, orderId, paymentId, signature } = z.object({
    billIds: z.array(z.number().int().positive()),
    orderId: z.string(),
    paymentId: z.string(),
    signature: z.string(),
  }).parse(req.body);

  if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
    return res.status(400).json({ error: "Payment signature verification failed" });
  }

  const paid = [];
  for (const billId of billIds) {
    try {
      const bill = await markBillPaid(billId, { orderId, paymentId, method: "ONLINE" });
      paid.push(bill);
    } catch (err) {
      console.error(`[bulk] Failed to mark bill ${billId} paid:`, err.message);
    }
  }

  res.json({ paid: true, count: paid.length, bills: paid });
}

export async function mockBulkPayment(req, res) {
  const { billIds } = createBulkOrderSchema.parse(req.body);
  if (isRazorpayConfigured()) return res.status(400).json({ error: "Real gateway active - use actual Razorpay checkout" });
  const bills = await prisma.bill.findMany({
    where: { id: { in: billIds }, unitId: req.user.unitId, status: { not: "PAID" } },
    include: { unit: true },
  });
  if (bills.length === 0) return res.status(400).json({ error: "No pending bills found" });

  const config = await getActiveConfig();
  const mockOrderId = "mock_bulk_" + Date.now();
  const paid = [];
  for (const b of bills) {
    const lateFee = computeLateFee(b, config);
    const t = billTotal(b, lateFee);
    await prisma.paymentTransaction.create({
      data: { billId: b.id, amount: t, method: "ONLINE", status: "PAID", razorpayOrderId: mockOrderId, razorpayPaymentId: "mock_pay_" + Date.now() },
    });
    const updated = await markBillPaid(b.id, { orderId: mockOrderId, paymentId: "mock_pay_" + Date.now(), method: "ONLINE" });
    paid.push(updated);
  }
  res.json({ paid: true, count: paid.length, bills: paid, mock: true });
}

function monthName(m) {
  return ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m] || "";
}
