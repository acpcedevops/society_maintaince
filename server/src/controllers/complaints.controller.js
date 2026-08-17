import { z } from "zod";
import { prisma } from "../lib/prisma.js";

export const COMPLAINT_CATEGORIES = ["PLUMBING", "ELECTRICAL", "LIFT", "CLEANING", "WATER", "PARKING", "NOISE", "OTHER"];
export const COMPLAINT_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];
export const COMPLAINT_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

const createSchema = z.object({
  category: z.enum(COMPLAINT_CATEGORIES),
  title: z.string().min(3),
  description: z.string().min(3),
  priority: z.enum(COMPLAINT_PRIORITIES).default("NORMAL"),
});

const updateSchema = z.object({
  status: z.enum(COMPLAINT_STATUSES).optional(),
  priority: z.enum(COMPLAINT_PRIORITIES).optional(),
  adminNote: z.string().optional().nullable(),
});

export async function listComplaints(req, res) {
  const { status, category } = req.query;
  const where = {};
  if (req.user.role === "MEMBER") where.userId = req.user.id;
  if (status) where.status = status;
  if (category) where.category = category;

  const complaints = await prisma.complaint.findMany({
    where,
    include: { user: { select: { name: true, phone: true } }, unit: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ complaints });
}

export async function createComplaint(req, res) {
  const data = createSchema.parse(req.body);
  const complaint = await prisma.complaint.create({
    data: { ...data, userId: req.user.id, unitId: req.user.unitId },
    include: { user: { select: { name: true, phone: true } }, unit: true },
  });
  res.status(201).json({ complaint });
}

export async function updateComplaint(req, res) {
  const id = Number(req.params.id);
  const data = updateSchema.parse(req.body);
  const resolvedAt = data.status === "RESOLVED" ? new Date() : data.status === "OPEN" ? null : undefined;
  const complaint = await prisma.complaint.update({
    where: { id },
    data: { ...data, resolvedAt },
    include: { user: { select: { name: true, phone: true } }, unit: true },
  });
  res.json({ complaint });
}

export async function deleteComplaint(req, res) {
  const id = Number(req.params.id);
  const complaint = await prisma.complaint.findUnique({ where: { id } });
  if (!complaint) return res.status(404).json({ error: "Complaint not found" });
  if (req.user.role !== "ADMIN" && complaint.userId !== req.user.id) {
    return res.status(403).json({ error: "Not allowed" });
  }
  await prisma.complaint.delete({ where: { id } });
  res.json({ ok: true });
}
