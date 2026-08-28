import { prisma } from "../db/prisma.js";
import { enqueueEmailJob } from "./emailQueue.js";

/**
 * Runs once at process startup (API server and/or worker process).
 *
 * Postgres is the source of truth for "what still needs to be sent".
 * BullMQ/Redis is durable too (AOF persistence, see docker-compose), so in
 * the common case every delayed job is still sitting in Redis after a
 * restart and this is a no-op. This pass exists as a safety net for the
 * uncommon case where Redis data was lost (e.g. Redis container recreated
 * without its volume) while Postgres survived: any EmailJob row that is
 * still SCHEDULED (i.e. not SENT) gets re-enqueued.
 *
 * Because `enqueueEmailJob` uses the EmailJob's own id as the BullMQ jobId,
 * re-running this against a queue that still has the job (the normal case)
 * is a safe no-op - BullMQ does not create a duplicate for a jobId that is
 * already waiting/delayed/active. Rows that were mid-send (SENDING) when
 * the process died are also picked up here; see README for the small
 * duplicate-send risk that implies when a crash happens after the SMTP
 * call succeeds but before the DB write.
 */
export async function runStartupReconciliation() {
  const pending = await prisma.emailJob.findMany({
    where: { status: { in: ["SCHEDULED", "QUEUED", "SENDING"] } },
  });

  if (pending.length === 0) {
    console.log("Startup reconciliation: nothing to re-enqueue.");
    return;
  }

  console.log(`Startup reconciliation: re-enqueuing ${pending.length} pending email job(s).`);

  for (const job of pending) {
    const delay = job.scheduledFor.getTime() - Date.now();
    await enqueueEmailJob(job.id, delay);
  }
}
