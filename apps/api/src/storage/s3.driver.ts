import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  IMMUTABLE_CACHE,
  type DirectUpload,
  type StorageDriver,
  type StoredFileInfo,
  type StoredObject,
} from "./storage.driver";

/** Any S3-compatible store: AWS S3, Cloudflare R2, MinIO. */
export class S3StorageDriver implements StorageDriver {
  readonly name = "s3" as const;
  private readonly client: S3Client;

  constructor(
    private readonly cfg: {
      endpoint?: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      publicBaseUrl: string;
      forcePathStyle?: boolean;
    },
  ) {
    this.client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      forcePathStyle: cfg.forcePathStyle ?? Boolean(cfg.endpoint),
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: IMMUTABLE_CACHE,
      }),
    );
    return { key, url: `${this.cfg.publicBaseUrl.replace(/\/+$/, "")}/${key}` };
  }

  /** Self-hosted APIs have no request-body cap, so videos go through the API. */
  async directUpload(): Promise<DirectUpload> {
    return { strategy: "api" };
  }

  private urlFor(key: string) {
    return `${this.cfg.publicBaseUrl.replace(/\/+$/, "")}/${key}`;
  }

  async stat(key: string): Promise<StoredFileInfo | null> {
    try {
      const h = await this.client.send(
        new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
      );
      return {
        key,
        url: this.urlFor(key),
        size: h.ContentLength ?? 0,
        contentType: h.ContentType ?? "",
      };
    } catch (err) {
      if ((err as { name?: string }).name === "NotFound") return null;
      throw err;
    }
  }

  async readStart(key: string, bytes: number): Promise<Buffer> {
    const r = await this.client.send(
      new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
    );
    const body = r.Body ? Buffer.from(await r.Body.transformToByteArray()) : Buffer.alloc(0);
    return body.subarray(0, bytes);
  }

  async delete(objects: StoredObject[]): Promise<void> {
    if (!objects.length) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.cfg.bucket,
        Delete: { Objects: objects.map((o) => ({ Key: o.key })), Quiet: true },
      }),
    );
  }
}
