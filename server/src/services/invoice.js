import PDFDocument from "pdfkit";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export async function billInvoiceStream(billId) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { unit: { include: { members: true } }, transactions: true },
  });
  if (!bill) throw Object.assign(new Error("Bill not found"), { status: 404 });

  const doc = new PDFDocument({ margin: 50 });
  const owner = bill.unit.members.find((m) => m.isOwner) || bill.unit.members[0];

  doc.fontSize(20).font("Helvetica-Bold").text(env.societyName, { align: "center" });
  doc.fontSize(9).font("Helvetica").text(env.societyAddress, { align: "center" });
  doc.moveDown().fontSize(11).text("MAINTENANCE INVOICE", { align: "center" }).moveDown();

  doc.fontSize(10);
  doc.text(`Invoice No : ${bill.invoiceNo || "Pending"}`);
  doc.text(`Date       : ${bill.paidAt ? bill.paidAt.toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN")}`);
  doc.text(`Unit       : ${bill.unit.unitNo}`);
  doc.text(`Owner      : ${bill.unit.ownerName}${owner ? ` (${owner.name})` : ""}`);
  doc.moveDown();

  const tableTop = doc.y;
  const col = { desc: 60, amount: 400 };
  doc.font("Helvetica-Bold");
  doc.text("Description", col.desc, tableTop);
  doc.text("Amount (INR)", col.amount, tableTop);
  doc.moveTo(50, tableTop + 16).lineTo(545, tableTop + 16).stroke();
  doc.font("Helvetica");

  const period = `${MONTHS[bill.month - 1]} ${bill.year}`;
  let rowY = tableTop + 24;
  doc.text(`Maintenance Charge - ${period} (${bill.unit.bhk})`, col.desc, rowY);
  doc.text(`Rs. ${bill.amount.toFixed(2)}`, col.amount, rowY);
  rowY += 24;

  const lateFee = bill.lateFee || 0;
  if (lateFee > 0) {
    doc.font("Helvetica");
    doc.text(`Late fee (due ${bill.dueDate.toLocaleDateString("en-IN")})`, col.desc, rowY);
    doc.text(`Rs. ${lateFee.toFixed(2)}`, col.amount, rowY);
    rowY += 24;
  }

  const total = bill.amount + lateFee;
  doc.font("Helvetica-Bold");
  doc.text("TOTAL", col.desc, rowY);
  doc.text(`Rs. ${total.toFixed(2)}`, col.amount, rowY);
  doc.moveTo(50, rowY + 16).lineTo(545, rowY + 16).stroke();

  doc.moveDown(4).fontSize(9).font("Helvetica");
  doc.text(`Status  : ${bill.status}`);
  doc.text(`Method  : ${bill.paymentMethod || "ONLINE"}`);
  if (bill.razorpayPaymentId) doc.text(`Razorpay Payment ID : ${bill.razorpayPaymentId}`);
  doc.text("This is a computer generated invoice from the society maintenance system.");

  doc.end();
  return doc;
}

export async function billInvoiceBuffer(billId) {
  const doc = await billInvoiceStream(billId);
  const chunks = [];
  return new Promise((resolve, reject) => {
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
