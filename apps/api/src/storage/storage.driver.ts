/**
 * Object storage abstraction (PRD §8.4 B, §10). Keys are content-addressed per
 * store, so objects are immutable and can be cached forever.
 */
export interface StoredObject {
  key: string;
  url: string;
}

/**
 * How the browser sends a large file (a video). "vercel-blob": straight to Blob with a
 * short-lived token limited to one path, type and size. "api": with the completion
 * request to the API (local disk and S3, where request bodies aren't capped).
 */
export type DirectUpload =
  | { strategy: "vercel-blob"; pathname: string; client_token: string }
  | { strategy: "api" };

export interface StoredFileInfo extends StoredObject {
  size: number;
  contentType: string;
}

export interface StorageDriver {
  readonly name: "local" | "s3" | "vercel-blob";
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  directUpload(key: string, contentType: string, maxBytes: number): Promise<DirectUpload>;
  /** Size and type of a stored file, or null when it isn't there. */
  stat(key: string): Promise<StoredFileInfo | null>;
  /** The first `bytes` bytes of a stored file (to check what it really is). */
  readStart(key: string, bytes: number): Promise<Buffer>;
  /** Best effort: missing objects are not an error. */
  delete(objects: StoredObject[]): Promise<void>;
}

export const STORAGE_DRIVER = Symbol("STORAGE_DRIVER");
export const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
