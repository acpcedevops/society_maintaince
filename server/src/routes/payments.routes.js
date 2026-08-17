import { Router } from "express";
import { requireAuth, asyncHandler } from "../middleware/auth.js";
import * as c from "../controllers/payments.controller.js";

const router = Router();

router.post("/create-order", requireAuth, asyncHandler(c.createOrder));
router.post("/create-bulk-order", requireAuth, asyncHandler(c.createBulkOrder));
router.post("/verify", requireAuth, asyncHandler(c.verifyPayment));
router.post("/verify-bulk", requireAuth, asyncHandler(c.verifyBulkPayment));
router.post("/mock", requireAuth, asyncHandler(c.mockPayment));
router.post("/mock-bulk", requireAuth, asyncHandler(c.mockBulkPayment));
router.post("/webhook", c.razorpayWebhook);

export default router;
