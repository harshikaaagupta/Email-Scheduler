import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { extractEmailsFromText } from "../utils/csv.js";
import { listActiveSenders, pickSenderRoundRobin } from "../mail/senders.js";
import { enqueueEmailJob } from "../queue/emailQueue.js";
import { searchEmails } from "../search/elasticsearch.js";
import type { EmailStatus } from "@prisma/client";

export const emailsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const composeSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  startTime: z.string().datetime({ offset: true }).or(z.string().min(1)),
  delaySeconds: z.coerce.number().int().min(0).default(0),
  hourlyLimit: z.coerce.number().int().min(1).default(200),
  recipients: z.string().optional(),
});

emailsRouter.post("/campaigns", requireAuth, upload.single("file"), async (req, res) => {
  const parsed = composeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  }
  const { subject, body, delaySeconds, hourlyLimit } = parsed.data;

  const startTime = new Date(parsed.data.startTime);
  if (Number.isNaN(startTime.getTime())) {
    return res.status(400).json({ error: "Invalid startTime" });
  }

  let recipients: string[] = [];
  if (req.file) {
    recipients = extractEmailsFromText(req.file.buffer.toString("utf-8"));
  } else if (parsed.data.recipients) {
    try {
      const list = JSON.parse(parsed.data.recipients);
      recipients = extractEmailsFromText(Array.isArray(list) ? list.join("\n") : String(list));
    } catch {
      return res.status(400).json({ error: "recipients must be a JSON array of email strings" });
    }
  }

  if (recipients.length === 0) {
    return res.status(400).json({ error: "No valid email addresses found. Upload a CSV/TXT file of leads." });
  }

  let senders;
  try {
    senders = await listActiveSenders();
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  const campaign = await prisma.campaign.create({
    data: {
      userId: req.user!.id,
      subject,
      body,
      startTime,
      delaySeconds,
      hourlyLimit,
      recipientCount: recipients.length,
    },
  });

  const createdJobs = await Promise.all(
    recipients.map(async (recipient, index) => {
      const sender = pickSenderRoundRobin(senders, index);
      const scheduledFor = new Date(startTime.getTime() + index * delaySeconds * 1000);

      const emailJob = await prisma.emailJob.create({
        data: {
          campaignId: campaign.id,
          senderId: sender.id,
          recipient,
          subject,
          body,
          scheduledFor,
          status: "SCHEDULED",
        },
      });

      await enqueueEmailJob(emailJob.id, scheduledFor.getTime() - Date.now());
      return emailJob.id;
    })
  );

  res.status(201).json({
    campaignId: campaign.id,
    recipientCount: recipients.length,
    emailJobIds: createdJobs,
  });
});

const SCHEDULED_STATUSES: EmailStatus[] = ["SCHEDULED", "QUEUED", "SENDING"];
const SENT_STATUSES: EmailStatus[] = ["SENT", "FAILED"];

async function listEmailJobs(statuses: EmailStatus[], q: string | undefined) {
  if (q) {
    const ids = await searchEmails({ query: q, status: statuses });
    if (ids !== null) {
      if (ids.length === 0) return [];
      const jobs = await prisma.emailJob.findMany({
        where: { id: { in: ids } },
        include: { sender: true },
      });
      // Preserve Elasticsearch's relevance ordering.
      const order = new Map(ids.map((id, i) => [id, i]));
      return jobs.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }
    // ES unavailable: fall back to a simple DB search below.
  }

  return prisma.emailJob.findMany({
    where: {
      status: { in: statuses },
      ...(q
        ? {
            OR: [
              { recipient: { contains: q, mode: "insensitive" } },
              { subject: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { sender: true },
    orderBy: statuses === SCHEDULED_STATUSES ? { scheduledFor: "asc" } : { updatedAt: "desc" },
    take: 200,
  });
}

emailsRouter.get("/scheduled", requireAuth, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const jobs = await listEmailJobs(SCHEDULED_STATUSES, q);
  res.json(
    jobs.map((job) => ({
      id: job.id,
      recipient: job.recipient,
      subject: job.subject,
      scheduledFor: job.scheduledFor,
      status: job.status,
      sender: job.sender ? { name: job.sender.name, email: job.sender.email } : null,
    }))
  );
});

emailsRouter.get("/sent", requireAuth, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const jobs = await listEmailJobs(SENT_STATUSES, q);
  res.json(
    jobs.map((job) => ({
      id: job.id,
      recipient: job.recipient,
      subject: job.subject,
      sentAt: job.sentAt,
      status: job.status,
      error: job.error,
      sender: job.sender ? { name: job.sender.name, email: job.sender.email } : null,
    }))
  );
});
