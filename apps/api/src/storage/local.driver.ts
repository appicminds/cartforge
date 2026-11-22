import { mkdir, open, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DirectUpload, StorageDriver, StoredFileInfo, StoredObject } from "./storage.driver";

/** Local disk (development and small self-hosted installs). Served by MediaFilesController. */
export class LocalStorageDriver implements StorageDriver {
  readonly name = "local" as const;
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Resolves a key inside root, refusing anything that escapes it. */
  resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, body: Buffer): Promise<StoredObject> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    return { key, url: `/api/v1/media/files/${key}` };
  }

  async directUpload(): Promise<DirectUpload> {
    return { strategy: "api" };
  }

  async stat(key: string): Promise<StoredFileInfo | null> {
    try {
      const s = await stat(this.resolve(key));
      return { key, url: `/api/v1/media/files/${key}`, size: s.size, contentType: "" };
    } catch {
      return null;
    }
  }

  async readStart(key: string, bytes: number): Promise<Buffer> {
    const f = await open(this.resolve(key), "r");
    try {
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await f.read(buf, 0, bytes, 0);
      return buf.subarray(0, bytesRead);
    } finally {
      await f.close();
    }
  }

  async delete(objects: StoredObject[]): Promise<void> {
    await Promise.all(objects.map((o) => rm(this.resolve(o.key), { force: true })));
  }
}
