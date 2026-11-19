import { del, put } from "@vercel/blob";
import type { StorageDriver, StoredObject } from "./storage.driver";

/** Vercel Blob (hosted demo on Vercel). Public, immutable, content-addressed objects. */
export class VercelBlobStorageDriver implements StorageDriver {
  readonly name = "vercel-blob" as const;

  constructor(private readonly token: string) {}

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    const blob = await put(key, body, {
      access: "public",
      contentType,
      token: this.token,
      addRandomSuffix: false,
      allowOverwrite: true, // same key ⇒ same content (checksum-addressed)
      cacheControlMaxAge: 31536000,
    });
    return { key, url: blob.url };
  }

  async delete(objects: StoredObject[]): Promise<void> {
    if (objects.length) await del(objects.map((o) => o.url), { token: this.token });
  }
}
