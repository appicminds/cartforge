import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import pino from "pino";
import { loadWorkerEnv } from "@cartforge/config";
import { createSystemProcessor } from "./processors.js";
import { HEARTBEAT_EVERY_MS, QUEUES, SYSTEM_JOBS } from "./queues.js";

async function main(): Promise<void> {
  const env = loadWorkerEnv();
  const log = pino({ level: env.LOG_LEVEL, base: { service: "worker" } });
  // BullMQ requires maxRetriesPerRequest: null on worker connections.
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const redis = new Redis(env.REDIS_URL);

  const systemQueue = new Queue(QUEUES.SYSTEM, { connection });
  await systemQueue.upsertJobScheduler(
    "worker-heartbeat",
    { every: HEARTBEAT_EVERY_MS },
    { name: SYSTEM_JOBS.HEARTBEAT, opts: { removeOnComplete: 10, removeOnFail: 50 } },
  );

  const worker = new Worker(QUEUES.SYSTEM, createSystemProcessor(redis), {
    connection,
    concurrency: 1,
  });
  worker.on("failed", (job, err) =>
    log.error({ job_id: job?.id, job: job?.name, err }, "job failed"),
  );
  worker.on("error", (err) => log.error({ err }, "worker error"));
  log.info({ queues: Object.values(QUEUES) }, "worker started");

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    log.info({ signal }, "shutting down");
    await worker.close();
    await systemQueue.close();
    await Promise.all([connection.quit(), redis.quit()]);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
