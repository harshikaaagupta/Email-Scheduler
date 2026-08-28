import { Queue } from "bullmq";
import { bullRedisConnection } from "../redis/connection.js";

export const EMAIL_QUEUE_NAME = "email-sending";

export const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
  connection: bullRedisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    // Keep history bounded but leave enough around for the Bull Board
    // dashboard to be useful; the Postgres row is the source of truth.
    removeOnComplete: { age: 24 * 3600, count: 5000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

export interface EmailJobData {
  emailJobId: string;
}

/**
 * Enqueue (or re-enqueue) a delayed send for an EmailJob row.
 *
 * Using the EmailJob's own id as the BullMQ jobId makes this idempotent:
 * calling it twice for the same row does not create a duplicate job as
 * long as the previous job hasn't already completed/been removed, which
 * is what lets our boot-time reconciliation safely "re-add" jobs that may
 * already exist in Redis after a restart.
 */
export async function enqueueEmailJob(emailJobId: string, delayMs: number) {
  return emailQueue.add(
    "send-email",
    { emailJobId } satisfies EmailJobData,
    {
      jobId: emailJobId,
      delay: Math.max(0, delayMs),
    }
  );
}
