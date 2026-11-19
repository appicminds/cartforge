/** Queue names shared with the API (producers). One place to avoid typos. */
export const QUEUES = {
  SYSTEM: "system",
  // Sprint 2: MEDIA = "media" (thumbnail/derivative generation)
} as const;

export const SYSTEM_JOBS = {
  HEARTBEAT: "heartbeat",
} as const;

/** Redis key the worker refreshes so readiness checks can see it's alive. */
export const WORKER_HEARTBEAT_KEY = "cartforge:worker:heartbeat";
export const HEARTBEAT_EVERY_MS = 30_000;
