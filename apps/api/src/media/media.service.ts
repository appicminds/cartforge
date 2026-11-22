import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma, storeScoped } from "@cartforge/database";
import { CATALOG_ERROR_CODES, type ListResponse, type MediaAssetSummary } from "@cartforge/types";
import type { MediaListQuery, MediaUpdate } from "@cartforge/validation";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { PrismaService } from "../prisma/prisma.service";
import { STORAGE_DRIVER, type StorageDriver, type StoredObject } from "../storage/storage.driver";
import { checksumOf, InvalidImageError, processImage } from "./image-processor";
import { toMediaSummary } from "./media.mapper";

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
}

export interface MediaActor {
  store_id: string;
  user_id: string;
  request_id?: string;
}

const LIVE = { deleted_at: null } as const;
const WITH_DERIVATIVES = { derivatives: true, _count: { select: { references: true } } } as const;

/** Resource types that can reference media. Pages/themes/menus join in later modules. */
export const MEDIA_RESOURCE = {
  PRODUCT: "product",
  CATEGORY: "category",
  COLLECTION: "collection",
} as const;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  async upload(
    file: UploadedFile,
    altText: string | null,
    actor: MediaActor,
  ): Promise<MediaAssetSummary> {
    const checksum = checksumOf(file.buffer);

    // Same bytes already in this store → reuse; never store a second copy.
    const existing = await this.findByChecksum(actor.store_id, checksum);
    if (existing) return toMediaSummary(existing, { deduplicated: true });

    let image;
    try {
      image = await processImage(file.buffer);
    } catch (err) {
      if (err instanceof InvalidImageError) {
        throw new AppException(
          CATALOG_ERROR_CODES.MEDIA_INVALID_FILE,
          err.message,
          HttpStatus.UNPROCESSABLE_ENTITY,
          [{ path: "file", message: err.message, code: "invalid_image" }],
        );
      }
      throw err;
    }

    const prefix = `stores/${actor.store_id}/media/${checksum}`;
    const stored: StoredObject[] = [];
    try {
      const original = await this.storage.put(
        `${prefix}/original.${image.ext}`,
        image.original.body,
        image.mime,
      );
      stored.push(original);
      const derivs = await Promise.all(
        image.derivatives.map(async (d) => {
          const obj = await this.storage.put(`${prefix}/${d.name}.webp`, d.body, "image/webp");
          stored.push(obj);
          return { ...d, obj };
        }),
      );

      const asset = await this.prisma.$transaction(async (tx) => {
        const created = await tx.mediaAsset.create({
          data: {
            store_id: actor.store_id,
            storage_driver: this.storage.name,
            storage_key: original.key,
            url: original.url,
            original_filename: file.originalname.slice(0, 255) || null,
            mime_type: image.mime,
            size_bytes: image.original.body.length,
            width: image.original.width,
            height: image.original.height,
            checksum_sha256: checksum,
            alt_text: altText,
            created_by: actor.user_id,
            derivatives: {
              create: derivs.map((d) => ({
                name: d.name,
                storage_key: d.obj.key,
                url: d.obj.url,
                mime_type: "image/webp",
                width: d.width,
                height: d.height,
                size_bytes: d.body.length,
              })),
            },
          },
          include: WITH_DERIVATIVES,
        });
        await this.audit.recordIn(tx, {
          action: "media.uploaded",
          resource_type: "media",
          resource_id: created.id,
          store_id: actor.store_id,
          actor_user_id: actor.user_id,
          metadata: {
            mime_type: image.mime,
            size_bytes: created.size_bytes,
            width: created.width,
            height: created.height,
          },
          request_id: actor.request_id,
        });
        return created;
      });
      return toMediaSummary(asset);
    } catch (err) {
      // Concurrent upload of the same file won the race: return that one.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const winner = await this.findByChecksum(actor.store_id, checksum);
        if (winner) return toMediaSummary(winner, { deduplicated: true });
      }
      // Keys are checksum-addressed, so a racing winner may share them — only clean
      // up when no live asset owns this checksum.
      if (!(await this.findByChecksum(actor.store_id, checksum))) await this.safeDelete(stored);
      throw err;
    }
  }

  async list(
    storeId: string,
    q: MediaListQuery,
  ): Promise<Omit<ListResponse<MediaAssetSummary>, "request_id">> {
    const where: Prisma.MediaAssetWhereInput = storeScoped(storeId, {
      ...LIVE,
      ...(q.q && {
        OR: [
          { original_filename: { contains: q.q, mode: "insensitive" as const } },
          { alt_text: { contains: q.q, mode: "insensitive" as const } },
        ],
      }),
    });
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.mediaAsset.count({ where }),
      this.prisma.mediaAsset.findMany({
        where,
        orderBy: [{ created_at: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * q.page_size,
        take: q.page_size,
        include: WITH_DERIVATIVES,
      }),
    ]);
    return {
      data: rows.map((r) => toMediaSummary(r)),
      meta: {
        page: q.page,
        page_size: q.page_size,
        total,
        total_pages: Math.ceil(total / q.page_size),
      },
    };
  }

  async update(id: string, input: MediaUpdate, actor: MediaActor): Promise<MediaAssetSummary> {
    const asset = await this.get(actor.store_id, id);
    const updated = await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { alt_text: input.alt_text },
      include: WITH_DERIVATIVES,
    });
    return toMediaSummary(updated);
  }

  /** Blocked while anything references the asset (PRD §8.8 rule 9, §10). */
  async remove(id: string, actor: MediaActor): Promise<void> {
    const objects = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.findFirst({
        where: storeScoped(actor.store_id, { id, ...LIVE }),
        include: { derivatives: true, references: { take: 10 } },
      });
      if (!asset) throw this.notFound();
      if (asset.references.length) {
        const count = await tx.mediaReference.count({ where: { media_asset_id: id } });
        throw new AppException(
          CATALOG_ERROR_CODES.MEDIA_IN_USE,
          `This image is used in ${count} place${count === 1 ? "" : "s"}. Remove it from there first.`,
          HttpStatus.CONFLICT,
          asset.references.map((r) => ({
            path: `${r.resource_type}:${r.resource_id}`,
            message: "In use",
            code: "in_use",
          })),
        );
      }
      await tx.mediaAsset.update({ where: { id }, data: { deleted_at: new Date() } });
      await this.audit.recordIn(tx, {
        action: "media.deleted",
        resource_type: "media",
        resource_id: id,
        store_id: actor.store_id,
        actor_user_id: actor.user_id,
        request_id: actor.request_id,
      });
      return [
        { key: asset.storage_key, url: asset.url },
        ...asset.derivatives.map((d) => ({ key: d.storage_key, url: d.url })),
      ];
    });
    await this.safeDelete(objects);
  }

  async get(storeId: string, id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: storeScoped(storeId, { id, ...LIVE }),
      include: WITH_DERIVATIVES,
    });
    if (!asset) throw this.notFound();
    return asset;
  }

  /**
   * Validates that every id is a live asset of this store (no cross-store
   * attachment). Throws a field error naming the offending entries.
   */
  async assertOwned(tx: Prisma.TransactionClient, storeId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const found = await tx.mediaAsset.findMany({
      where: storeScoped(storeId, { id: { in: ids }, ...LIVE }),
      select: { id: true },
    });
    const ok = new Set(found.map((f) => f.id));
    const missing = ids.map((id, i) => ({ id, i })).filter((x) => !ok.has(x.id));
    if (missing.length) {
      throw new AppException(
        CATALOG_ERROR_CODES.MEDIA_NOT_FOUND,
        "Some images no longer exist. Remove them and try again.",
        HttpStatus.UNPROCESSABLE_ENTITY,
        missing.map((m) => ({
          path: `media.${m.i}.media_asset_id`,
          message: "Image not found",
          code: "not_found",
        })),
      );
    }
  }

  private findByChecksum(storeId: string, checksum: string) {
    return this.prisma.mediaAsset.findFirst({
      where: storeScoped(storeId, { checksum_sha256: checksum, ...LIVE }),
      include: WITH_DERIVATIVES,
    });
  }

  private async safeDelete(objects: StoredObject[]): Promise<void> {
    try {
      await this.storage.delete(objects);
    } catch (err) {
      // Orphaned objects are harmless (content-addressed); log for cleanup.
      this.logger.warn({ err, count: objects.length }, "Failed to delete stored media objects");
    }
  }

  private notFound() {
    return new AppException(
      CATALOG_ERROR_CODES.MEDIA_NOT_FOUND,
      "Image not found.",
      HttpStatus.NOT_FOUND,
    );
  }
}
