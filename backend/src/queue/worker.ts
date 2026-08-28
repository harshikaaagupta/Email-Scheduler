import "dotenv/config";
import { Worker, DelayedError, type Job } from "bullmq";
import { bullRedisConnection } from "../redis/connection.js";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { EMAIL_QUEUE_NAME, type EmailJobData } from "./emailQueue.js";
import { consumeRateLimitSlot, shouldNotifyRateLimitHit } from "./rateLimiter.js";
import { sendEmail } from "../mail/sendEmail.js";
import { indexEmailDocument } from "../search/elasticsearch.js";
import { notifyRateLimitHit } from "../notifications/slack.js";
import { runStartupReconciliation } from "./scheduler.js";

async function processEmailJob(job: Job<EmailJobData>, token?: string) {
  const emailJob = await prisma.emailJob.findUnique({
    where: { id: job.data.emailJobId },
    include: { sender: true, campaign: true },
  });

  if (!emailJob) {
    console.warn(`EmailJob ${job.data.emailJobId} no longer exists, skipping.`);
    return;
  }

  // Idempotency guard: if this row was already sent (e.g. a stale job got
  // re-added by the reconciliation pass), never send it twice.
  if (emailJob.status === "SENT") {
    return;
  }

  if (!emailJob.sender) {
    await prisma.emailJob.update({
      where: { id: emailJob.id },
      data: { status: "FAILED", error: "No sender assigned" },
    });
    return;
  }

  // A sender's configured cap is a hard ceiling; a campaign can optionally
  // ask for a tighter (never looser) per-hour pace via its own hourlyLimit.
  const senderLimit = emailJob.sender.maxEmailsPerHour || env.maxEmailsPerHourDefault;
  const limit = emailJob.campaign?.hourlyLimit
    ? Math.min(senderLimit, emailJob.campaign.hourlyLimit)
    : senderLimit;
  const rateLimit = await consumeRateLimitSlot(emailJob.sender.id, limit);

  if (!rateLimit.allowed) {
    const nextWindowStart = new Date(rateLimit.nextWindowStart);

    await prisma.emailJob.update({
      where: { id: emailJob.id },
      data: { status: "SCHEDULED", scheduledFor: nextWindowStart },
    });

    if (await shouldNotifyRateLimitHit(emailJob.sender.id)) {
      await notifyRateLimitHit({
        senderName: emailJob.sender.name,
        senderEmail: emailJob.sender.email,
        limitPerHour: limit,
        nextWindowStart,
      });
    }

    if (token) {
      // Push the job itself into the next hour window instead of failing
      // it - it keeps its place in the queue and its jobId (idempotency
      // intact) and BullMQ does not count this as a failed attempt.
      await job.moveToDelayed(rateLimit.nextWindowStart, token);
      throw new DelayedError();
    }
    return;
  }

  await prisma.emailJob.update({ where: { id: emailJob.id }, data: { status: "SENDING" } });

  try {
    await sendEmail({
      sender: emailJob.sender,
      to: emailJob.recipient,
      subject: emailJob.subject,
      body: emailJob.body,
    });

    const sentAt = new Date();
    await prisma.emailJob.update({
      where: { id: emailJob.id },
      data: { status: "SENT", sentAt, error: null },
    });

    await indexEmailDocument({
      id: emailJob.id,
      recipient: emailJob.recipient,
      subject: emailJob.subject,
      body: emailJob.body,
      status: "SENT",
      senderEmail: emailJob.sender.email,
      scheduledFor: emailJob.scheduledFor.toISOString(),
      sentAt: sentAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attemptsMade = job.attemptsMade + 1;
    const isFinalAttempt = attemptsMade >= (job.opts.attempts ?? 1);

    await prisma.emailJob.update({
      where: { id: emailJob.id },
      data: {
        status: isFinalAttempt ? "FAILED" : "SCHEDULED",
        error: message,
        attempts: attemptsMade,
      },
    });

    if (isFinalAttempt) {
      await indexEmailDocument({
        id: emailJob.id,
        recipient: emailJob.recipient,
        subject: emailJob.subject,
        body: emailJob.body,
        status: "FAILED",
        senderEmail: emailJob.sender.email,
        scheduledFor: emailJob.scheduledFor.toISOString(),
      });
    }

    throw err;
  }
}

export function startWorker() {
  const worker = new Worker<EmailJobData>(EMAIL_QUEUE_NAME, processEmailJob, {
    connection: bullRedisConnection,
    concurrency: env.workerConcurrency,
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("Worker error:", err);
  });

  console.log(`Email worker started (concurrency=${env.workerConcurrency})`);
  return worker;
}

// Allow running as its own process (`npm run worker:dev` / `worker:start`)
// as well as being started in-process by the API server.
const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  runStartupReconciliation()
    .catch((err) => console.error("Startup reconciliation failed:", err))
    .finally(() => startWorker());
}
