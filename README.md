# Neev Plaza — Society Management & Audit App

A full-stack web application for **Neev Plaza society** to manage monthly maintenance payments, day-by-day expenses (with OCR receipt scanning), member dues, invoices, complaints, and annual audit reports.

## Features

### For Members
- **Maintenance bills** — view current & past month bills, due dates, and status
- **Pay online** via Razorpay (UPI, Cards, Netbanking) with webhook verification
- **Download PDF invoice** after payment
- **Raise complaints** (plumbing, electrical, lift, water, etc.) and track status
- **Read society notices**

### For Admin
- **Member & Unit management** — add/edit units, owners, and member accounts
- **Monthly billing** — set maintenance amount and auto-generate bills for all units
- **Payments** — track who paid / who owes month-by-month, record offline (cash/cheque/UPI) payments
- **Expense tracking** — log daily spending (vendor, category, amount, date)
- **OCR receipt scanning** — upload a receipt photo; text & amount are extracted automatically for review before saving
- **Reports & Audit** — monthly & annual income vs expense, member-wise dues matrix, and export to **PDF / CSV** for the auditor
- **Complaint management** — update statuses and add admin notes

## Tech Stack

| Layer    | Tech                                   |
|----------|----------------------------------------|
| Frontend | React 18 (Vite) + Tailwind CSS         |
| Backend  | Node.js + Express                      |
| Database | SQLite (Prisma ORM) — portable to PostgreSQL |
| Payments | Razorpay (orders, signature verify, webhooks) |
| OCR      | Tesseract.js (offline/free) + sharp preprocessing |
| PDF      | pdfkit                                 |

## Getting Started

### 1. Server

```bash
cd server
npm install
cp .env.example .env   # edit secrets & Razorpay keys
npm run db:setup       # creates DB + seeds demo data
npm run dev            # API on http://localhost:5000
```

### 2. Client

```bash
cd client
npm install
npm run dev            # app on http://localhost:5173
```

Open http://localhost:5173

### Demo accounts (from seed data)

| Role   | Phone       | Password   |
|--------|-------------|------------|
| Admin  | 9999999999  | admin123   |
| Member | 9000000000  | member123  |

## Payments (Razorpay)

1. Create a Razorpay account and get **test keys** from https://dashboard.razorpay.com
2. Put them in `server/.env`:
   ```
   RAZORPAY_KEY_ID="rzp_test_xxxxx"
   RAZORPAY_KEY_SECRET="your_secret"
   ```
3. Without keys, the **Demo Pay** button simulates the gateway so the whole flow is testable.
4. For live payments, use live keys and set the webhook URL to `https://your-domain/api/payments/webhook` (with the `payment.captured` event). The webhook is verified with Razorpay's HMAC signature for security.

## OCR Receipt Scanning

- Go to **Expenses → Scan Receipt (OCR)**, upload a photo/PDF of the receipt.
- Tesseract (offline, free) extracts the text; the app pre-fills **vendor, amount, and date**.
- Review/correct the values, then save. The receipt image and OCR text are stored with the expense record.

## API Overview

| Method | Endpoint                     | Description                          | Access |
|--------|------------------------------|--------------------------------------|--------|
| POST   | /api/auth/login              | Login                                | Public |
| POST   | /api/auth/register           | Register member                      | Public |
| GET    | /api/bills                   | List bills (own or all)              | Both   |
| POST   | /api/bills/generate          | Generate monthly bills for all units | Admin  |
| POST   | /api/bills/offline-payment   | Record cash/cheque payment           | Admin  |
| POST   | /api/payments/create-order   | Create Razorpay order                | Member |
| POST   | /api/payments/verify         | Verify payment signature             | Member |
| POST   | /api/payments/mock           | Simulate payment (no keys)           | Member |
| POST   | /api/payments/webhook        | Razorpay webhook                     | Webhook |
| GET    | /api/invoices/:billId        | Download invoice PDF                 | Both   |
| GET    | /api/expenses                | List expenses                        | Admin  |
| POST   | /api/expenses/ocr            | OCR a receipt upload                 | Admin  |
| POST   | /api/expenses                | Create expense                       | Admin  |
| GET    | /api/reports/dashboard       | Admin dashboard summary              | Admin  |
| GET    | /api/reports/annual?year=Y   | Annual report (json/csv/pdf)         | Admin  |
| GET    | /api/reports/monthly         | Monthly income/expense               | Admin  |
| GET    | /api/reports/dues?year=Y     | Member dues matrix (json/csv)        | Admin  |
| GET    | /api/complaints              | List complaints                      | Both   |
| POST   | /api/complaints              | Raise complaint                      | Member |
| PUT    | /api/complaints/:id          | Update status/note                   | Admin  |
| GET    | /api/notices                 | List notices                         | Both   |
| POST   | /api/notices                 | Post notice                          | Admin  |

## Notes

- Switch to **PostgreSQL** by changing `provider` to `postgresql` in `server/prisma/schema.prisma` and setting `DATABASE_URL`, then `npx prisma migrate dev`.
- For production: set a strong `JWT_SECRET`, live Razorpay keys, HTTPS, and a managed database.
- Future ADDA features planned: gate passes/visitor management, polls, facility booking.
