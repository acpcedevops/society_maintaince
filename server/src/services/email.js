import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transporter = null;

function getTransporter() {
  if (!env.smtpHost || !env.smtpUser) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: { user: env.smtpUser, pass: env.smtpPass },
    });
  }
  return transporter;
}

export function isEmailConfigured() {
  return Boolean(env.smtpHost && env.smtpUser);
}

export async function sendInvoiceEmail({ to, invoiceNo, bill, pdfBuffer }) {
  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP not configured - invoice email skipped. Set SMTP_HOST/SMTP_USER/SMTP_PASS in server/.env");
    return { skipped: true };
  }
  const ownerName = bill.unit?.ownerName || "";
  const period = `${bill.month}/${bill.year}`;
  const info = await t.sendMail({
    from: env.smtpFrom,
    to,
    subject: `Neev Plaza - Maintenance Payment Receipt ${invoiceNo} (${period})`,
    headers: {
      "X-Priority": "1",
      "X-MSMail-Priority": "High",
      "Importance": "high",
      "List-Unsubscribe": `<mailto:neevplazataloja@gmail.com?subject=unsubscribe>`,
    },
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#1e40af;color:white;padding:16px 20px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">Neev Plaza Society</h2>
          <p style="margin:4px 0 0;opacity:0.9;font-size:14px">Maintenance Payment Receipt</p>
        </div>
        <div style="padding:20px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <p>Dear <b>${ownerName}</b>,</p>
          <p>Thank you for your maintenance payment for <b>${period}</b>.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px 0;color:#64748b">Invoice No</td><td style="padding:8px 0;font-weight:bold">${invoiceNo}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b">Amount Paid</td><td style="padding:8px 0;font-weight:bold;color:#16a34a">Rs. ${(bill.amount + (bill.lateFee || 0)).toFixed(2)}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b">Status</td><td style="padding:8px 0;font-weight:bold;color:#16a34a">PAID</td></tr>
          </table>
          <p style="color:#64748b;font-size:13px">Your invoice PDF is attached to this email.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0"/>
          <p style="color:#94a3b8;font-size:12px">Regards,<br/>Neev Plaza Society Management</p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: `${invoiceNo}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
  console.log(`[email] Invoice ${invoiceNo} sent to ${to} (id=${info.messageId})`);
  return { sent: true, messageId: info.messageId };
}
