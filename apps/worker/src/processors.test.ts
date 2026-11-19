import { describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { Redis } from "ioredis";
import { createSystemProcessor } from "./processors.js";
import { WORKER_HEARTBEAT_KEY } from "./queues.js";

describe("system processor", () => {
  it("writes the heartbeat key with a TTL", async () => {
    const set = vi.fn().mockResolvedValue("OK");
    const run = createSystemProcessor({ set } as unknown as Redis);
    await run({ name: "heartbeat" } as Job);
    expect(set).toHaveBeenCalledWith(WORKER_HEARTBEAT_KEY, expect.any(String), "PX", 90_000);
  });

  it("rejects unknown jobs", async () => {
    const run = createSystemProcessor({} as Redis);
    await expect(run({ name: "mystery" } as Job)).rejects.toThrow(/Unknown system job/);
  });
});
