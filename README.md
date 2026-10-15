# Society Maintenance Portal (multi-society)

A housing-society maintenance & community web app (replica of `society-maintaince.onrender.com`),
extended to support **multiple independent societies** in one deployment, plus a
**Gate / Visitor & Delivery Management** module.
Residents pay maintenance, raise complaints, view notices, approve visitors and track deliveries;
guards log gate entries and manage packages; admins manage billing, expenses, members, security
policy and reports — all scoped to their own society.

## Tech stack

| Layer    | Tech                                                              |
| -------- | ----------------------------------------------------------------- |
| Frontend | React 18 + Vite + TailwindCSS + React Router + Axios              |
| Backend  | Node.js + Express + JWT auth + Zod validation + Prisma ORM        |
| Database | MySQL                                                             |
| Extras   | Razorpay payments (optional), Tesseract.js receipt OCR            |

## Modules

- **Auth** — multi-society: pick society + phone + password; self-registration as member, or self-service society creation (becomes its admin); roles `ADMIN` / `MEMBER` / `GUARD`
- **Dashboard** — admin: FY collection/expense analytics; member: dues, bills, notices
- **Gate / Visitor & Delivery** — guards log visitor/delivery entries; residents approve/deny; package drop-point board; security policy (gated / non-gated / hybrid); guards manage guards; in-app notifications
- **QR delivery verification + in-app calling** — residents generate a QR *delivery pass* (unit-wide or tied to a specific delivery); the guard scans it in-app to verify and confirm the delivery (auto-creating the tracked package); the guard can then place an in-app **voice call** to the resident over WebRTC (Socket.IO signaling), with a missed-call notification when the resident is offline
- **Bills & Payments** — monthly bill generation, late-fee accrual, online (mock/Razorpay) + offline (cash/cheque/UPI) payments, invoices
- **Complaints** — raise, track, and resolve service requests
- **Notices** — society announcements
- **Members & Units** — resident + flat management (admin)
- **Flat Details** — unit inventory (admin)
- **Expenses** — expense tracking with categories and OCR receipt scanning (admin)
- **Reports & Audit** — yearly income/expense breakdown, CSV / print-to-PDF export (admin)

## Project structure

```
Society-maintaince/
├─ server/                     # Express + Prisma API
│  ├─ prisma/schema.prisma     # MySQL data model
│  ├─ prisma/seed.js           # Neev Plaza + Green Valley demo data
│  └─ src/
│     ├─ routes/               # auth, societies, units, members, bills, payments,
│     │                        # complaints, notices, expenses, reports, gate, config
│     ├─ services/             # payments.js, ocr.js
│     ├─ middleware/           # auth.js (protect/adminOnly/gateAccess/denyGuard), error.js
│     └─ lib/                  # prisma.js, jwt.js, billing.js, society.js
└─ web/                        # React + Vite frontend
   └─ src/
      ├─ pages/                # Login, Dashboard, Bills, Complaints, Notices,
      │                        # Members, Flats, Expenses, Reports, Gate
      ├─ components/           # Layout, guards, Modal, Badge, StatCard, NotificationBell...
      ├─ context/AuthContext.jsx
      └─ lib/                  # api.js, payments.js, format.js
```

## Prerequisites

- Node.js 18+ (tested on 20)
- A running MySQL 8 server

## Setup

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Configure the database

Copy `server/.env.example` to `server/.env` and set `DATABASE_URL`, e.g.:

```env
DATABASE_URL="mysql://USER:PASSWORD@127.0.0.1:3306/society_maintenance"
JWT_SECRET="some-long-random-secret"
```

Create the database once (any MySQL client):

```sql
CREATE DATABASE society_maintenance CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. Create the schema & seed demo data

```bash
npm run db:push     # creates tables from prisma/schema.prisma
npm run seed        # loads Neev Plaza demo society
```

### 4. Run

```bash
# terminal 1 — API on http://localhost:4000
npm run dev:server

# terminal 2 — web on http://localhost:5173
npm run dev:web
```

For production, build the frontend and let Express serve it as one service:

```bash
npm run build:web
npm start           # serves API + SPA on http://localhost:4000
```

## Demo accounts

The app is **multi-society**. Log in by choosing the **society** first, then phone + password.
The seed creates two societies to demonstrate isolation — note the *same* phone works in both:

| Society               | Role   | Phone        | Password    |
| --------------------- | ------ | ------------ | ----------- |
| Neev Plaza            | Admin  | `9999999999` | `admin123`  |
| Neev Plaza            | Member | `9000000000` | `member123` |
| Neev Plaza            | Member | `9594390592` | `member123` (sarin, unit 304) |
| Neev Plaza            | Guard  | `9999900000` | `guard123`  |
| Green Valley Residency| Admin  | `9999999999` | `admin123`  |
| Green Valley Residency| Member | `9000000000` | `member123` (unit A-101) |
| Green Valley Residency| Guard  | `9999900000` | `guard123`  |

> Login is by **society + phone + password**. The same phone can belong to multiple societies
> (it is unique *per society*). Each society's data — units, members, bills, notices, expenses,
> config, reports — is fully isolated.

## Creating societies & registering

- **Create a new society** — on the Create Account screen choose *Create a new society*; you become
  that society's first **admin**, and a default maintenance config + expense categories are created.
  A unique join code (e.g. `SUNRISE-APARTMENTS`) is generated automatically.
- **Join an existing society** — choose *Join a society*, pick the society and your unit, and register
  as a member.
- Admins can also add members directly from **Members & Units**.

## API reference (summary)

```
POST   /api/auth/register            {societyId, name, phone, email, password, unitNo?}  -> join society
POST   /api/auth/register-society    {societyName, name, phone, email, password}        -> create society (admin)
POST   /api/auth/login               {societyId|societyCode, phone, password} -> {token, user}
GET    /api/auth/me
GET    /api/societies                public: {id, name, code} list for login/registration
GET    /api/societies/:id/units      public: unit list for registration
GET    /api/config                   -> {appName, razorpayConfigured}

GET    /api/units                    (admin)
POST   /api/units                    (admin)
PUT    /api/units/:id                (admin)
DELETE /api/units/:id                (admin)
GET    /api/units/summary            (admin) per-unit dues summary

GET    /api/members                  (admin)
POST   /api/members                  (admin)
PUT    /api/members/:id              (admin)
DELETE /api/members/:id              (admin)

GET    /api/bills                    (auth, scoped for members)
GET    /api/bills/month/:month/:year (auth)
POST   /api/bills/generate           (admin) {month, year}
GET    /api/bills/config             (auth)
POST   /api/bills/config             (admin) {name, amount1bhk, amount2bhk, lateFeePerDay, dueDay}
POST   /api/bills/offline-payment    (admin) {billId, amount, method}

POST   /api/payments/create-order       {billId}
POST   /api/payments/create-bulk-order  {billIds}
POST   /api/payments/verify             {billId, razorpay_*}
POST   /api/payments/verify-bulk        {billIds, razorpay_*}
POST   /api/payments/mock               {billId}     Demo Pay
POST   /api/payments/mock-bulk          {billIds}    Demo Pay All

GET    /api/complaints               (auth, scoped for members)
POST   /api/complaints               (auth) {category, title, description, priority}
PATCH  /api/complaints/:id           (admin) {status, adminNote}

GET    /api/notices                  (auth)
POST   /api/notices                  (admin) {title, body}
DELETE /api/notices/:id              (admin)

GET    /api/expenses                 (admin)
POST   /api/expenses                 (admin) {categoryId, vendor, amount, date, description}
GET    /api/expenses/categories      (admin)
POST   /api/expenses/ocr             (admin) multipart "receipt" -> {receiptPath, ocrText, parsed}
DELETE /api/expenses/:id             (admin)

GET    /api/reports/dashboard?year=  (admin)

GET    /api/gate/policy              (auth)  security policy for the society
PUT    /api/gate/policy              (admin) {mode, requireOtpForDelivery, guardCanOverride,
                                               dropPointEnabled, dropPointLabel, otpExpiryMinutes}
GET    /api/gate/guards              (admin)
POST   /api/gate/guards              (admin) {name, phone, email?, password?}
PUT    /api/gate/guards/:id          (admin)
DELETE /api/gate/guards/:id          (admin)

GET    /api/gate/entries             (auth, scoped for members) ?status=&type=
POST   /api/gate/entries             (auth) {unitId, type, name, phone?, vehicleNo?, purpose?, directAdmit?}
POST   /api/gate/entries/:id/decision(auth) {decision: APPROVED|DENIED, placement?}
POST   /api/gate/entries/:id/enter   (guard/admin)
POST   /api/gate/entries/:id/exit    (guard/admin)

GET    /api/gate/packages            (auth, scoped for members) ?status=
POST   /api/gate/packages/:id/collect(auth)

POST   /api/gate/passes              (auth) {unitId?, gateEntryId?, purpose?, expiresInMinutes?} -> {pass}
GET    /api/gate/passes              (auth, scoped for members) ?status=
POST   /api/gate/passes/:id/revoke   (auth) resident/admin
POST   /api/gate/passes/verify       (guard/admin) {token, placement?} -> {pass, entry, package, unit, resident}
GET    /api/gate/entries/:id/resident(guard/admin) -> {resident, unit}  contact for in-app call

# Realtime (Socket.IO, same JWT): call:start / incoming / accept / reject / offer / answer / ice / end
# Path: /socket.io  ·  emit `call:start {toUserId, callId, context}` to ring the resident

GET    /api/gate/notifications       (auth) -> {notifications, unread}
POST   /api/gate/notifications/:id/read
POST   /api/gate/notifications/read-all
```

## Notes

- **Late fees** are computed dynamically on read: `lateFeePerDay × days overdue` (from the config's
  `dueDay`), so unpaid bills automatically become `OVERDUE`. This matches the original app.
- **Payments.** Clicking **Pay Now** (or *Pay Selected* / *Pay All*) opens a payment gateway page.
  With no keys configured the app runs in **Demo mode**: a sandbox gateway page (UPI / Card /
  Netbanking) appears and completes the payment without charging. To use the **real Razorpay
  checkout**, set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (test keys are fine) in `server/.env`
  and restart the server — the SDK checkout and signature verification then activate automatically,
  and the demo gateway is skipped.
- **OCR** uses Tesseract.js. The English language model is downloaded on first scan and cached.
- **Gate module (Phase 1).** Each society has a `SecurityPolicy` (`GATED` / `NON_GATED` / `HYBRID`,
  `guardCanOverride`, `requireOtpForDelivery`, drop-point settings). Guards log visitor/delivery
  entries; residents approve/deny from their **Gate** page and choose where a package is left
  (gate / lobby / drop box / handed directly). Approving with a drop point creates a trackable
  `Package`; residents get **in-app notifications** (bell in the header). Guards have a
  gate-only portal.
- **QR delivery verification + in-app calling (Phase 2).** A resident taps **My Delivery Pass**
  (or **QR Pass** on a specific delivery request) to mint a `GatePass` whose opaque token is
  drawn as a QR code. The guard taps **Scan Pass** to read it with the device camera (or types
  the code) — the server verifies and consumes the token, auto-approves the linked delivery and
  creates its package. The guard can then **Call** the resident: audio flows peer-to-peer over
  WebRTC with Socket.IO used only for signaling (`/socket.io`, authenticated with the same JWT).
  If the resident is offline the caller gets a **missed-call notification** instead.
  - Calls use public STUN by default. To traverse strict NATs in production set
    `VITE_ICE_SERVERS` to a JSON array or comma-separated list of ICE/TURN URLs when building
    the web app (e.g. `VITE_ICE_SERVERS='[{"urls":"turn:turn.example.com","username":"u","credential":"p"}]'`).
  - Camera access requires HTTPS (or `localhost`) in the browser.
