const nodemailer = require('nodemailer');

const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

const configured = Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS);

let transporter = null;
if (configured) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: String(SMTP_SECURE).toLowerCase() === 'true' || Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

const from = SMTP_FROM || SMTP_USER || 'Society Portal <no-reply@localhost>';

function isConfigured() {
  return configured;
}

// Sends an email. When SMTP is not configured the message is written to the
// server log instead, so the flow remains testable without an email provider.
async function sendMail({ to, subject, html, text }) {
  if (!to) {
    console.warn('[mailer] No recipient — email skipped.');
    return { sent: false, reason: 'no-recipient' };
  }
  if (!transporter) {
    console.log('[mailer] SMTP not configured — email not sent (logged instead).');
    console.log(`[mailer] To: ${to}`);
    console.log(`[mailer] Subject: ${subject}`);
    if (text) console.log(`[mailer] Body:\n${text}`);
    return { sent: false, reason: 'not-configured' };
  }
  try {
    const info = await transporter.sendMail({ from, to, subject, html, text });
    console.log(`[mailer] Sent "${subject}" to ${to} (${info.messageId})`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[mailer] Failed to send email to ${to}:`, err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendMail, isConfigured };
