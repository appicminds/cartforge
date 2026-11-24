import { BlobNotFoundError, del, head, put } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import type { DirectUpload, StorageDriver, StoredFileInfo, StoredObject } from "./storage.driver";

/** Upload tokens for videos last long enough for a slow connection, and no longer. */
const TOKEN_TTL_MS = 60 * 60 * 1000;

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

  async directUpload(key: string, contentType: string, maxBytes: number): Promise<DirectUpload> {
    const client_token = await generateClientTokenFromReadWriteToken({
      token: this.token,
      pathname: key,
      allowedContentTypes: [contentType],
      maximumSizeInBytes: maxBytes,
      validUntil: Date.now() + TOKEN_TTL_MS,
      addRandomSuffix: false,
      allowOverwrite: true, // checksum-addressed: same key ⇒ same content
      cacheControlMaxAge: 31536000,
    });
    return { strategy: "vercel-blob", pathname: key, client_token };
  }

  async stat(key: string): Promise<StoredFileInfo | null> {
    try {
      const b = await head(key, { token: this.token });
      return { key, url: b.url, size: b.size, contentType: b.contentType };
    } catch (err) {
      if (err instanceof BlobNotFoundError) return null;
      throw err;
    }
  }

  async readStart(key: string, bytes: number): Promise<Buffer> {
    const info = await this.stat(key);
    if (!info) return Buffer.alloc(0);
    const res = await fetch(info.url, { headers: { Range: `bytes=0-${bytes - 1}` } });
    if (!res.ok) return Buffer.alloc(0);
    return Buffer.from(await res.arrayBuffer()).subarray(0, bytes);
  }

  async delete(objects: StoredObject[]): Promise<void> {
    if (objects.length)
      await del(
        objects.map((o) => o.url),
        { token: this.token },
      );
  }
}
