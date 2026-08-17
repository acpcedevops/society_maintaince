import { Router } from "express";
import { requireAuth, requireAdmin, asyncHandler } from "../middleware/auth.js";
import * as c from "../controllers/bills.controller.js";

const router = Router();

router.use(requireAuth);
router.get("/", asyncHandler(c.listBills));
router.get("/config", asyncHandler(c.getConfig));
router.get("/month/:month/:year?", asyncHandler(c.getBillsByMonth));

router.post("/generate", requireAdmin, asyncHandler(c.generate));
router.post("/config", requireAdmin, asyncHandler(c.upsertConfig));
router.post("/offline-payment", requireAdmin, asyncHandler(c.recordOfflinePayment));
router.post("/:id/resend-invoice", requireAdmin, asyncHandler(c.resendInvoice));

export default router;
