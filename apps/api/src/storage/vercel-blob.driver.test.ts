import { getPayloadFromClientToken } from "@vercel/blob/client";
import { describe, expect, it } from "vitest";
import { VercelBlobStorageDriver } from "./vercel-blob.driver";

describe("VercelBlobStorageDriver.directUpload", () => {
  it("issues a short-lived token limited to one path, type and size", async () => {
    const driver = new VercelBlobStorageDriver("vercel_blob_rw_teststore_secretsecretsecret");
    const before = Date.now();
    const up = await driver.directUpload("stores/s1/media/abc/original.mp4", "video/mp4", 1000);
    expect(up.strategy).toBe("vercel-blob");
    if (up.strategy !== "vercel-blob") return;
    expect(up.pathname).toBe("stores/s1/media/abc/original.mp4");
    const payload = getPayloadFromClientToken(up.client_token);
    expect(payload).toMatchObject({
      pathname: "stores/s1/media/abc/original.mp4",
      allowedContentTypes: ["video/mp4"],
      maximumSizeInBytes: 1000,
      addRandomSuffix: false,
    });
    expect(payload.validUntil).toBeGreaterThan(before);
    expect(payload.validUntil).toBeLessThanOrEqual(before + 61 * 60 * 1000);
  });
});
