import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getActiveConfig, computeAmount, computeLateFee, billTotal } from "../services/billing.js";

const unitSchema = z.object({
  unitNo: z.string().min(1),
  floor: z.number().int().default(1),
  bhk: z.enum(["1BHK", "2BHK", "3BHK"]).optional().default("1BHK"),
  amountOverride: z.number().positive().optional().nullable(),
  sqft: z.number().int().positive().optional().nullable(),
  ownerName: z.string().min(2),
  occupants: z.number().int().default(1),
});

const memberSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10).max(15),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  password: z.string().min(6),
  unitId: z.number().int().positive(),
  isOwner: z.boolean().optional(),
});

export async function listUnits(req, res) {
  const units = await prisma.unit.findMany({
    orderBy: [{ floor: "asc" }, { unitNo: "asc" }],
    include: {
      members: { select: { id: true, name: true, phone: true, isOwner: true } },
      _count: { select: { bills: true } },
    },
  });
  res.json({ units });
}

export async function createUnit(req, res) {
  const data = unitSchema.parse(req.body);
  const unit = await prisma.unit.create({ data });
  res.status(201).json({ unit });
}

export async function updateUnit(req, res) {
  const id = Number(req.params.id);
  const data = unitSchema.partial().parse(req.body);
  const unit = await prisma.unit.update({ where: { id }, data });

  const config = await getActiveConfig();
  if (config && (data.amountOverride !== undefined || data.bhk !== undefined)) {
    const newAmount = computeAmount(unit, config);
    await prisma.bill.updateMany({
      where: { unitId: id, status: { not: "PAID" } },
      data: { amount: newAmount },
    });
  }
  res.json({ unit });
}

export async function deleteUnit(req, res) {
  const id = Number(req.params.id);
  await prisma.unit.delete({ where: { id } });
  res.json({ ok: true });
}

export async function listMembers(req, res) {
  const members = await prisma.user.findMany({
    where: { role: "MEMBER" },
    include: { unit: true },
    orderBy: [{ unitId: "asc" }, { name: "asc" }],
  });
  res.json({ members: members.map(publicMember) });
}

export async function createMember(req, res) {
  const data = memberSchema.parse(req.body);
  const bcrypt = (await import("bcryptjs")).default;
  const exists = await prisma.user.findUnique({ where: { phone: data.phone } });
  if (exists) return res.status(409).json({ error: "Phone number already registered" });
  const passwordHash = await bcrypt.hash(data.password, 10);
  const member = await prisma.user.create({
    data: {
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      passwordHash,
      unitId: data.unitId,
      isOwner: data.isOwner || false,
      role: "MEMBER",
    },
    include: { unit: true },
  });
  res.status(201).json({ member: publicMember(member) });
}

export async function updateMember(req, res) {
  const id = Number(req.params.id);
  const { password, ...rest } = memberSchema.partial().parse(req.body);
  const bcrypt = (await import("bcryptjs")).default;
  const data = { ...rest };
  if (password) data.passwordHash = await bcrypt.hash(password, 10);
  const member = await prisma.user.update({ where: { id }, data, include: { unit: true } });
  res.json({ member: publicMember(member) });
}

export async function deleteMember(req, res) {
  const id = Number(req.params.id);
  await prisma.user.delete({ where: { id } });
  res.json({ ok: true });
}

export async function unitSummary(req, res) {
  const config = await getActiveConfig();
  const units = await prisma.unit.findMany({
    orderBy: [{ floor: "asc" }, { unitNo: "asc" }],
    include: {
      members: { select: { id: true, name: true, phone: true, email: true, isOwner: true } },
      bills: { select: { id: true, amount: true, status: true, lateFee: true, dueDate: true } },
    },
  });

  const result = units.map((u) => {
    let totalPaid = 0;
    let totalPending = 0;
    let totalLateFee = 0;
    let paidCount = 0;
    let pendingCount = 0;

    u.bills.forEach((b) => {
      if (b.status === "PAID") {
        totalPaid += b.amount + (b.lateFee || 0);
        paidCount++;
      } else {
        const lateFee = config ? computeLateFee(b, config) : 0;
        totalPending += billTotal(b, lateFee);
        totalLateFee += lateFee;
        pendingCount++;
      }
    });

    return {
      id: u.id,
      unitNo: u.unitNo,
      floor: u.floor,
      bhk: u.bhk,
      ownerName: u.ownerName,
      amountOverride: u.amountOverride,
      members: u.members,
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalPending: Math.round(totalPending * 100) / 100,
      totalLateFee: Math.round(totalLateFee * 100) / 100,
      paidCount,
      pendingCount,
      totalBills: u.bills.length,
    };
  });

  const grandTotalPaid = result.reduce((s, u) => s + u.totalPaid, 0);
  const grandTotalPending = result.reduce((s, u) => s + u.totalPending, 0);

  res.json({ units: result, summary: { totalPaid: grandTotalPaid, totalPending: grandTotalPending, totalUnits: result.length } });
}

export async function unitDetails(req, res) {
  const id = Number(req.params.id);
  const config = await getActiveConfig();
  const unit = await prisma.unit.findUnique({
    where: { id },
    include: {
      members: { select: { id: true, name: true, phone: true, email: true, isOwner: true, createdAt: true } },
      bills: { orderBy: [{ year: "desc" }, { month: "desc" }] },
    },
  });
  if (!unit) return res.status(404).json({ error: "Unit not found" });

  let totalPaid = 0;
  let totalPending = 0;
  let totalLateFeePaid = 0;
  let totalLateFeePending = 0;

  const bills = unit.bills.map((b) => {
    const lateFee = b.status === "PAID" ? (b.lateFee || 0) : (config ? computeLateFee(b, config) : 0);
    const total = billTotal(b, lateFee);
    if (b.status === "PAID") {
      totalPaid += total;
      totalLateFeePaid += lateFee;
    } else {
      totalPending += total;
      totalLateFeePending += lateFee;
    }
    return {
      id: b.id,
      month: b.month,
      year: b.year,
      amount: b.amount,
      lateFee,
      total,
      status: b.status,
      dueDate: b.dueDate,
      paidAt: b.paidAt,
      paymentMethod: b.paymentMethod,
      invoiceNo: b.invoiceNo,
    };
  });

  res.json({
    unit: {
      id: unit.id,
      unitNo: unit.unitNo,
      floor: unit.floor,
      bhk: unit.bhk,
      ownerName: unit.ownerName,
      amountOverride: unit.amountOverride,
      sqft: unit.sqft,
      occupants: unit.occupants,
      members: unit.members,
    },
    bills,
    summary: {
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalPending: Math.round(totalPending * 100) / 100,
      totalLateFeePaid: Math.round(totalLateFeePaid * 100) / 100,
      totalLateFeePending: Math.round(totalLateFeePending * 100) / 100,
      paidCount: unit.bills.filter((b) => b.status === "PAID").length,
      pendingCount: unit.bills.filter((b) => b.status !== "PAID").length,
      totalBills: unit.bills.length,
    },
  });
}

function publicMember(m) {
  return {
    id: m.id,
    name: m.name,
    phone: m.phone,
    email: m.email,
    role: m.role,
    unitId: m.unitId,
    unit: m.unit,
    isOwner: m.isOwner,
  };
}
