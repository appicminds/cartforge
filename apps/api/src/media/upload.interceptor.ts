import {
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import multer from "multer";
import type { Observable } from "rxjs";
import { CATALOG_ERROR_CODES, ERROR_CODES } from "@cartforge/types";
import { AppException } from "../common/app-exception";
import { API_ENV, type ApiEnv } from "../config/env";

/**
 * Single-file multipart parser held in memory, capped at MEDIA_MAX_BYTES before
 * anything is buffered beyond the limit. Field name: "file"; optional "alt_text".
 */
@Injectable()
export class MediaUploadInterceptor implements NestInterceptor {
  private readonly upload: ReturnType<ReturnType<typeof multer>["single"]>;
  private readonly maxBytes: number;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.maxBytes = env.MEDIA_MAX_BYTES;
    this.upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: env.MEDIA_MAX_BYTES, files: 1, fields: 5, fieldSize: 2048, parts: 6 },
    }).single("file");
  }

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    await new Promise<void>((resolve, reject) =>
      this.upload(req, res, (err: unknown) => (err ? reject(this.mapError(err)) : resolve())),
    );
    if (!req.file) {
      throw AppException.validation([
        { path: "file", message: "Choose an image to upload.", code: "required" },
      ]);
    }
    return next.handle();
  }

  private mapError(err: unknown): AppException {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        const mb = (this.maxBytes / 1024 / 1024).toFixed(this.maxBytes % (1024 * 1024) ? 1 : 0);
        return new AppException(
          CATALOG_ERROR_CODES.MEDIA_TOO_LARGE,
          `Images can be up to ${mb} MB.`,
          HttpStatus.PAYLOAD_TOO_LARGE,
          [{ path: "file", message: `Images can be up to ${mb} MB.`, code: "too_large" }],
        );
      }
      return new AppException(
        ERROR_CODES.VALIDATION_FAILED,
        "Upload one image at a time using the “file” field.",
        HttpStatus.BAD_REQUEST,
      );
    }
    return new AppException(
      ERROR_CODES.VALIDATION_FAILED,
      "Malformed upload.",
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * Video completion: `poster` (the cover frame, an image up to MEDIA_MAX_BYTES) and,
 * when the storage driver has no direct upload, `file` (the video itself).
 */
@Injectable()
export class VideoCompleteInterceptor implements NestInterceptor {
  private readonly upload: ReturnType<ReturnType<typeof multer>["fields"]>;

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {
    this.upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: Math.max(env.MEDIA_MAX_VIDEO_BYTES, env.MEDIA_MAX_BYTES),
        files: 2,
        fields: 10,
        fieldSize: 2048,
        parts: 12,
      },
    }).fields([
      { name: "poster", maxCount: 1 },
      { name: "file", maxCount: 1 },
    ]);
  }

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    await new Promise<void>((resolve, reject) =>
      this.upload(req, res, (err: unknown) => {
        if (!err) return resolve();
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          const mb = Math.floor(this.env.MEDIA_MAX_VIDEO_BYTES / 1024 / 1024);
          return reject(
            new AppException(
              CATALOG_ERROR_CODES.MEDIA_TOO_LARGE,
              `Videos can be up to ${mb} MB.`,
              HttpStatus.PAYLOAD_TOO_LARGE,
            ),
          );
        }
        reject(
          new AppException(
            ERROR_CODES.VALIDATION_FAILED,
            "Malformed upload.",
            HttpStatus.BAD_REQUEST,
          ),
        );
      }),
    );
    const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
    const poster = files.poster?.[0];
    if (!poster) {
      throw AppException.validation([
        { path: "poster", message: "A cover image is required.", code: "required" },
      ]);
    }
    if (poster.size > this.env.MEDIA_MAX_BYTES) {
      throw AppException.validation([
        { path: "poster", message: "The cover image is too large.", code: "too_large" },
      ]);
    }
    return next.handle();
  }
}
