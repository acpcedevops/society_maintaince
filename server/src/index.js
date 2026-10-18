require('dotenv').config();

const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { errorHandler, notFound } = require('./middleware/error');
const { initSockets } = require('./lib/socket');
const { bootstrapSuperAdmin } = require('./lib/superadmin');
const { startBillingScheduler } = require('./lib/billing');

const app = express();

app.set('trust proxy', 1);
app.use(cors());
app.use(
  express.json({
    limit: '5mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'society-maintenance', time: new Date() }));

app.use('/api/config', require('./routes/config.routes'));
app.use('/api/gate', require('./routes/gate.routes'));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/societies', require('./routes/societies.routes'));
app.use('/api/super', require('./routes/super.routes'));
// Cashfree webhook is public (authenticated via HMAC signature), so mount it
// before the guard that protects the rest of the member/bill/payment routes.
app.use('/api/payments/webhook', require('./routes/payments.webhook.routes'));
const { denyGuard } = require('./middleware/auth');
app.use(['/api/units', '/api/members', '/api/bills', '/api/payments', '/api/complaints', '/api/notices', '/api/expenses', '/api/reports'], denyGuard);
app.use('/api/units', require('./routes/units.routes'));
app.use('/api/members', require('./routes/members.routes'));
app.use('/api/bills', require('./routes/bills.routes'));
app.use('/api/payments', require('./routes/payments.routes'));
app.use('/api/complaints', require('./routes/complaints.routes'));
app.use('/api/notices', require('./routes/notices.routes'));
app.use('/api/expenses', require('./routes/expenses.routes'));
app.use('/api/reports', require('./routes/reports.routes'));

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Serve the built frontend when it exists (production / single-service deploy).
const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.use('/api', notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);
initSockets(server, { corsOrigin: process.env.CORS_ORIGIN || true });
server.listen(PORT, () => {
  console.log(`Society Maintenance API running on http://localhost:${PORT}`);
  bootstrapSuperAdmin().catch((err) => console.error('[superadmin] bootstrap failed:', err.message));
  startBillingScheduler();
});

module.exports = app;
