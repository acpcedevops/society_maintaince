import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../middleware/auth.js";

const registerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10).max(15),
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(6),
  unitNo: z.string().optional(),
  isOwner: z.boolean().optional(),
});

const loginSchema = z.object({
  phone: z.string().min(10).max(15),
  password: z.string().min(1),
});

export async function register(req, res) {
  const data = registerSchema.parse(req.body);
  const { name, phone, email, password, unitNo, isOwner } = data;

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) return res.status(409).json({ error: "Phone number already registered" });

  let unit = null;
  if (unitNo) {
    unit = await prisma.unit.findUnique({ where: { unitNo } });
    if (!unit) return res.status(400).json({ error: `Unit "${unitNo}" does not exist` });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name,
      phone,
      email: email || null,
      passwordHash,
      unitId: unit ? unit.id : null,
      isOwner: isOwner || false,
      role: "MEMBER",
    },
  });

  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
}

export async function login(req, res) {
  const { phone, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid phone number or password" });
  }
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
}

export async function me(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { unit: true },
  });
  res.json({ user: publicUser(user) });
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    role: u.role,
    unitId: u.unitId,
    isOwner: u.isOwner,
    unit: u.unit,
  };
}
