import { Router } from "express";
import { requireAuth, requireAdmin, asyncHandler } from "../middleware/auth.js";
import * as c from "../controllers/notices.controller.js";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(c.listNotices));
router.post("/", requireAdmin, asyncHandler(c.createNotice));
router.delete("/:id", requireAdmin, asyncHandler(c.deleteNotice));

export default router;
