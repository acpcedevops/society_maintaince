import { Router } from "express";
import { requireAuth, asyncHandler } from "../middleware/auth.js";
import { billInvoiceStream } from "../services/invoice.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.get(
  "/:billId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const billId = Number(req.params.billId);
    const bill = await prisma.bill.findUnique({ where: { id: billId } });
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    if (req.user.role === "MEMBER" && bill.unitId !== req.user.unitId) {
      return res.status(403).json({ error: "Not your bill" });
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=invoice-${billId}.pdf`);
    const stream = await billInvoiceStream(billId);
    stream.pipe(res);
  })
);

export default router;
