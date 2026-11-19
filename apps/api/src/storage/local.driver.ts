import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageDriver, StoredObject } from "./storage.driver";

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

  async delete(objects: StoredObject[]): Promise<void> {
    await Promise.all(objects.map((o) => rm(this.resolve(o.key), { force: true })));
  }
}
