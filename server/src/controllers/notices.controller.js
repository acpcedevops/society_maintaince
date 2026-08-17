import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const noticeSchema = z.object({
  title: z.string().min(2),
  body: z.string().min(2),
});

export async function listNotices(req, res) {
  const notices = await prisma.notice.findMany({
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ notices });
}

export async function createNotice(req, res) {
  const data = noticeSchema.parse(req.body);
  const notice = await prisma.notice.create({ data: { ...data, createdById: req.user.id } });
  res.status(201).json({ notice });
}

export async function deleteNotice(req, res) {
  const id = Number(req.params.id);
  await prisma.notice.delete({ where: { id } });
  res.json({ ok: true });
}
