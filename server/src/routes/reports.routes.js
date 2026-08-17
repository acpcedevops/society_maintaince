import { Router } from "express";
import { requireAuth, requireAdmin, asyncHandler } from "../middleware/auth.js";
import * as c from "../controllers/reports.controller.js";

const router = Router();
router.use(requireAuth);

router.get("/dashboard", requireAdmin, asyncHandler(c.getDashboard));
router.get("/monthly", requireAdmin, asyncHandler(c.getMonthly));
router.get("/annual", requireAdmin, asyncHandler(c.getAnnual));
router.get("/dues", requireAdmin, asyncHandler(c.getDues));

export default router;
