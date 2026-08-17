import { Router } from "express";
import { requireAuth, requireAdmin, asyncHandler } from "../middleware/auth.js";
import * as c from "../controllers/complaints.controller.js";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(c.listComplaints));
router.post("/", asyncHandler(c.createComplaint));
router.put("/:id", requireAdmin, asyncHandler(c.updateComplaint));
router.delete("/:id", asyncHandler(c.deleteComplaint));

export default router;
