import { Redis } from "ioredis";
import { env } from "../config/env.js";

// BullMQ requires maxRetriesPerRequest: null on any connection it manages.
// We reuse the same options for our own rate-limit counters so everything
// talks to the same Redis instance that backs the queue.
export function createRedisConnection(): Redis {
  return new Redis({
    host: env.redisHost,
    port: env.redisPort,
    password: env.redisPassword,
    maxRetriesPerRequest: null,
  });
}

// Shared connection for BullMQ Queue/Worker/QueueEvents instances.
export const bullRedisConnection = createRedisConnection();

// Separate connection for our own commands (rate-limit counters, locks)
// so BullMQ's internal blocking commands never contend with them.
export const redis = createRedisConnection();
