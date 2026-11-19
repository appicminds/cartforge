/**
 * Object storage abstraction (PRD §8.4 B, §10). Keys are content-addressed per
 * store, so objects are immutable and can be cached forever.
 */
export interface StoredObject {
  key: string;
  url: string;
}

export interface StorageDriver {
  readonly name: "local" | "s3" | "vercel-blob";
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  /** Best effort: missing objects are not an error. */
  delete(objects: StoredObject[]): Promise<void>;
}

export const STORAGE_DRIVER = Symbol("STORAGE_DRIVER");
export const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
