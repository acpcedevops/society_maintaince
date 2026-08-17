import { Router } from "express";
import { requireAuth, requireAdmin, asyncHandler } from "../middleware/auth.js";
import * as c from "../controllers/units.controller.js";

const router = Router();

const adminGuard = [requireAuth, requireAdmin];
router.get("/units", ...adminGuard, asyncHandler(c.listUnits));
router.get("/units/summary", ...adminGuard, asyncHandler(c.unitSummary));
router.get("/units/:id/details", ...adminGuard, asyncHandler(c.unitDetails));
router.post("/units", ...adminGuard, asyncHandler(c.createUnit));
router.put("/units/:id", ...adminGuard, asyncHandler(c.updateUnit));
router.delete("/units/:id", ...adminGuard, asyncHandler(c.deleteUnit));
router.get("/members", ...adminGuard, asyncHandler(c.listMembers));
router.post("/members", ...adminGuard, asyncHandler(c.createMember));
router.put("/members/:id", ...adminGuard, asyncHandler(c.updateMember));
router.delete("/members/:id", ...adminGuard, asyncHandler(c.deleteMember));

export default router;
