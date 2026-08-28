import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { getCurrentHourUsage } from "../queue/rateLimiter.js";

export const sendersRouter = Router();

sendersRouter.get("/", requireAuth, async (_req, res) => {
  const senders = await prisma.sender.findMany({ orderBy: { createdAt: "asc" } });
  const withUsage = await Promise.all(
    senders.map(async (sender) => ({
      id: sender.id,
      name: sender.name,
      email: sender.email,
      maxEmailsPerHour: sender.maxEmailsPerHour,
      usedThisHour: await getCurrentHourUsage(sender.id),
    }))
  );
  res.json(withUsage);
});
