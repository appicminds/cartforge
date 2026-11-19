import type { Job } from "bullmq";
import type { Redis } from "ioredis";
import { HEARTBEAT_EVERY_MS, SYSTEM_JOBS, WORKER_HEARTBEAT_KEY } from "./queues.js";

export function createSystemProcessor(redis: Redis) {
  return async (job: Job): Promise<unknown> => {
    switch (job.name) {
      case SYSTEM_JOBS.HEARTBEAT: {
        const at = new Date().toISOString();
        await redis.set(WORKER_HEARTBEAT_KEY, at, "PX", HEARTBEAT_EVERY_MS * 3);
        return { at };
      }
      default:
        // Unknown jobs fail loudly rather than being silently dropped.
        throw new Error(`Unknown system job: ${job.name}`);
    }
  };
}
