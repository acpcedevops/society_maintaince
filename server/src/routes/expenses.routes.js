import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { requireAuth, requireAdmin, asyncHandler } from "../middleware/auth.js";
import * as c from "../controllers/expenses.controller.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, "..", "uploads");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `receipt-${Date.now()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    cb(null, file.mimetype.startsWith("image/") || file.mimetype === "application/pdf"),
});

const router = Router();
router.use(requireAuth);

router.get("/categories", asyncHandler(c.listCategories));
router.get("/", requireAdmin, asyncHandler(c.listExpenses));

router.post("/", requireAdmin, upload.single("receipt"), asyncHandler(c.createExpense));
router.post("/ocr", requireAdmin, upload.single("receipt"), asyncHandler(c.ocrUpload));
router.put("/:id", requireAdmin, asyncHandler(c.updateExpense));
router.delete("/:id", requireAdmin, asyncHandler(c.deleteExpense));

export default router;
