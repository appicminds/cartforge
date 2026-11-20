import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { ApiZodBody } from "../common/openapi";
import type { Request, Response } from "express";
import {
  CATALOG_ERROR_CODES,
  PERMISSIONS,
  type DetailResponse,
  type ListResponse,
  type MediaAssetSummary,
} from "@cartforge/types";
import {
  mediaListQuerySchema,
  mediaUpdateSchema,
  type MediaListQuery,
  type MediaUpdate,
} from "@cartforge/validation";
import { CurrentAuth, CurrentStore, Public, RequirePermissions } from "../auth/decorators";
import { AppException } from "../common/app-exception";
import type { AuthContext, StoreContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { LocalStorageDriver } from "../storage/local.driver";
import { IMMUTABLE_CACHE, STORAGE_DRIVER, type StorageDriver } from "../storage/storage.driver";
import { MediaService, type MediaActor } from "./media.service";
import { MediaUploadInterceptor } from "./upload.interceptor";

const mediaId = new ParseUUIDPipe({
  exceptionFactory: () =>
    new AppException(CATALOG_ERROR_CODES.MEDIA_NOT_FOUND, "Image not found.", HttpStatus.NOT_FOUND),
});

@ApiTags("media")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true, description: "Store scope (UUID)" })
@Controller("media")
export class MediaController {
  constructor(
    private readonly media: MediaService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  private actor(auth: AuthContext, store: StoreContext, req: Request): MediaActor {
    return { store_id: store.store_id, user_id: auth.user_id, request_id: String(req.id) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MEDIA_WRITE)
  @UseInterceptors(MediaUploadInterceptor)
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    required: true,
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: { type: "string", format: "binary", description: "JPEG, PNG or WebP" },
        alt_text: { type: "string", maxLength: 500 },
      },
    },
  })
  @ApiOperation({
    summary: "Upload an image (multipart field `file`, optional `alt_text`)",
    description:
      "JPEG, PNG or WebP. Identical files are de-duplicated per store (`deduplicated: true`).",
  })
  async upload(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
  ): Promise<DetailResponse<MediaAssetSummary>> {
    const file = req.file!;
    const alt =
      typeof req.body?.alt_text === "string"
        ? req.body.alt_text.trim().slice(0, 500) || null
        : null;
    const data = await this.media.upload(file, alt, this.actor(auth, store, req));
    return { data, request_id: String(req.id) };
  }

  @Get()
  @RequirePermissions(PERMISSIONS.MEDIA_READ)
  @ApiOperation({ summary: "List/search media assets" })
  async list(
    @CurrentStore() store: StoreContext,
    @Query(new ZodValidationPipe(mediaListQuerySchema)) q: MediaListQuery,
    @Req() req: Request,
  ): Promise<ListResponse<MediaAssetSummary>> {
    return { ...(await this.media.list(store.store_id, q)), request_id: String(req.id) };
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.MEDIA_WRITE)
  @ApiOperation({ summary: "Update an asset's default alt text" })
  @ApiZodBody(mediaUpdateSchema)
  async update(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Param("id", mediaId) id: string,
    @Body(new ZodValidationPipe(mediaUpdateSchema)) body: MediaUpdate,
    @Req() req: Request,
  ): Promise<DetailResponse<MediaAssetSummary>> {
    return {
      data: await this.media.update(id, body, this.actor(auth, store, req)),
      request_id: String(req.id),
    };
  }

  @Delete(":id")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.MEDIA_DELETE)
  @ApiOperation({ summary: "Delete an unused asset (409 MEDIA_IN_USE while referenced)" })
  async remove(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Param("id", mediaId) id: string,
    @Req() req: Request,
  ): Promise<{ data: { id: string; deleted: true }; request_id: string }> {
    await this.media.remove(id, this.actor(auth, store, req));
    return { data: { id, deleted: true }, request_id: String(req.id) };
  }

  /**
   * Serves files for the local storage driver. Public because product images are
   * public storefront content; keys are unguessable checksums per store.
   */
  @Public()
  @Get("files/*path")
  @ApiOperation({ summary: "Serve a locally stored media file (local driver only)" })
  serve(@Param("path") parts: string[] | string, @Res() res: Response): void {
    if (!(this.storage instanceof LocalStorageDriver)) throw AppException.notFound("File");
    const key = Array.isArray(parts) ? parts.join("/") : parts;
    let full: string;
    try {
      full = this.storage.resolve(key);
    } catch {
      throw AppException.notFound("File");
    }
    res.setHeader("Cache-Control", IMMUTABLE_CACHE);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    res.sendFile(full, { dotfiles: "deny" }, (err) => {
      if (err && !res.headersSent)
        res
          .status(404)
          .json({ error: { code: "NOT_FOUND", message: "File not found." }, request_id: "" });
    });
  }
}
