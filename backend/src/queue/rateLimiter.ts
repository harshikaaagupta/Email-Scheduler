import { redis } from "../redis/connection.js";

const HOUR_MS = 3600_000;

function hourBucket(ts: number): number {
  return Math.floor(ts / HOUR_MS);
}

export interface RateLimitResult {
  allowed: boolean;
  /** epoch ms of the next window the caller should retry in, when !allowed */
  nextWindowStart: number;
}

/**
 * Atomically tries to consume one send-slot for `senderId` in the current
 * hour window. Backed by a Redis counter keyed by sender + hour bucket, so
 * the limit is enforced correctly no matter how many worker processes /
 * instances are running concurrently (INCR is atomic in Redis).
 */
export async function consumeRateLimitSlot(senderId: string, limitPerHour: number): Promise<RateLimitResult> {
  const now = Date.now();
  const bucket = hourBucket(now);
  const key = `ratelimit:sender:${senderId}:${bucket}`;

  const count = await redis.incr(key);
  if (count === 1) {
    // TTL a bit longer than an hour so a slow job can't leave a
    // never-expiring key behind.
    await redis.expire(key, 7200);
  }

  if (count <= limitPerHour) {
    return { allowed: true, nextWindowStart: now };
  }

  // We already incremented past the limit; give the slot back since this
  // job will not be sent in this window.
  await redis.decr(key);
  const nextWindowStart = (bucket + 1) * HOUR_MS;
  return { allowed: false, nextWindowStart };
}

/**
 * Ensures we only fire one Slack notification per sender per hour window,
 * even though many jobs may hit the limit in that same window.
 */
/** Read-only peek at how many sends a sender has used in the current hour window. */
export async function getCurrentHourUsage(senderId: string): Promise<number> {
  const bucket = hourBucket(Date.now());
  const key = `ratelimit:sender:${senderId}:${bucket}`;
  const value = await redis.get(key);
  return value ? Number(value) : 0;
}

export async function shouldNotifyRateLimitHit(senderId: string): Promise<boolean> {
  const bucket = hourBucket(Date.now());
  const key = `ratelimit:notified:${senderId}:${bucket}`;
  const result = await redis.set(key, "1", "EX", 3700, "NX");
  return result === "OK";
}
