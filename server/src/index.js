import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import { notFound, errorHandler } from "./middleware/error.js";

import authRoutes from "./routes/auth.routes.js";
import unitsRoutes from "./routes/units.routes.js";
import billsRoutes from "./routes/bills.routes.js";
import paymentsRoutes from "./routes/payments.routes.js";
import invoicesRoutes from "./routes/invoices.routes.js";
import expensesRoutes from "./routes/expenses.routes.js";
import reportsRoutes from "./routes/reports.routes.js";
import complaintsRoutes from "./routes/complaints.routes.js";
import noticesRoutes from "./routes/notices.routes.js";
import { isRazorpayConfigured } from "./services/razorpay.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const app = express();
app.use(cors());
app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadsDir));

app.get("/api/health", (_req, res) => res.json({ ok: true, society: env.societyName }));
app.get("/api/config", (_req, res) =>
  res.json({ societyName: env.societyName, razorpayConfigured: isRazorpayConfigured() })
);
app.use("/api/auth", authRoutes);
app.use("/api", unitsRoutes);
app.use("/api/bills", billsRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/invoices", invoicesRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/complaints", complaintsRoutes);
app.use("/api/notices", noticesRoutes);

const publicDir = path.join(__dirname, "..", "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(publicDir, "index.html"));
    }
  });
}

app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`Neev Plaza API running on http://localhost:${env.port}`);
});
