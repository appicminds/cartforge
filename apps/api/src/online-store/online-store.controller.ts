import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  Res,
} from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  HEADERS,
  PERMISSIONS,
  type DetailResponse,
  type MenuView,
  type PageView,
  type StorefrontPage,
  type StorefrontThemePayload,
  type TemplateAssignment,
  type TemplateTargetKind,
  type ThemeTemplateNames,
  type ThemeDetail,
  type ThemePresetSummary,
  type ThemePreviewLink,
  type ThemeSaveResult,
  type ThemeSummary,
  type ThemeVersionSummary,
} from "@cartforge/types";
import {
  menuSchema,
  pageSchema,
  templateAssignSchema,
  themeCreateSchema,
  themeDataSchema,
  themeRenameSchema,
  type MenuData,
  type PageData,
} from "@cartforge/validation";
import { CurrentAuth, CurrentStore, Public, RequirePermissions } from "../auth/decorators";
import { AppException } from "../common/app-exception";
import { ApiZodBody } from "../common/openapi";
import type { AuthContext, StoreContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ThemePreviewTokens } from "../storefront/preview-token";
import { InvalidatesStorefront } from "../storefront/revalidation";
import { StorefrontService } from "../storefront/storefront.service";
import { MenusService } from "./menus.service";
import { PagesService } from "./pages.service";
import { ThemesService } from "./themes.service";

const uuid = (what: string) =>
  new ParseUUIDPipe({ exceptionFactory: () => AppException.notFound(what) });
const actor = (auth: AuthContext, req: Request) => ({
  user_id: auth.user_id,
  request_id: String(req.id),
});
const noBody = z.object({}).strict();
const ok = <T>(req: Request, data: T) => ({ data, request_id: String(req.id) });

/** Admin: Online store → Themes and the theme editor. */
@ApiTags("online-store")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true })
@Controller("themes")
export class ThemesController {
  constructor(private readonly themes: ThemesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "The store's themes (the live one first)" })
  async list(
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
  ): Promise<DetailResponse<ThemeSummary[]>> {
    return ok(req, await this.themes.list(s.store_id));
  }

  @Get("presets")
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "Ready-made themes to start from" })
  presets(@Req() req: Request): DetailResponse<ThemePresetSummary[]> {
    return ok(req, this.themes.presets());
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "A theme with its saved content (for the editor)" })
  async get(
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Theme")) id: string,
  ): Promise<DetailResponse<ThemeDetail>> {
    return ok(req, await this.themes.get(s.store_id, id));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.THEMES_WRITE)
  @ApiZodBody(themeCreateSchema)
  @ApiOperation({ summary: "Add a theme from a preset (unpublished)" })
  async create(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(themeCreateSchema)) body: { preset: string; name?: string },
  ): Promise<DetailResponse<ThemeSummary>> {
    return ok(req, await this.themes.create(s.store_id, body.preset, body.name, actor(auth, req)));
  }

  @Post(":id/duplicate")
  @RequirePermissions(PERMISSIONS.THEMES_WRITE)
  @ApiZodBody(noBody)
  @ApiOperation({ summary: "Copy a theme (unpublished)" })
  async duplicate(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Theme")) id: string,
  ): Promise<DetailResponse<ThemeSummary>> {
    return ok(req, await this.themes.duplicate(s.store_id, id, actor(auth, req)));
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.THEMES_WRITE)
  @ApiZodBody(themeRenameSchema)
  @ApiOperation({ summary: "Rename a theme" })
  async rename(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Theme")) id: string,
    @Body(new ZodValidationPipe(themeRenameSchema)) body: { name: string },
  ): Promise<DetailResponse<ThemeSummary>> {
    return ok(req, await this.themes.rename(s.store_id, id, body.name, actor(auth, req)));
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.THEMES_WRITE)
  @ApiOperation({ summary: "Delete a theme that isn't live" })
  async remove(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Theme")) id: string,
  ): Promise<void> {
    await this.themes.remove(s.store_id, id, actor(auth, req));
  }

  @Put(":id/data")
  @RequirePermissions(PERMISSIONS.THEMES_WRITE)
  @ApiZodBody(themeDataSchema)
  @ApiOperation({ summary: "Save the editor's changes (not live until published)" })
  async save(
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Theme")) id: string,
    @Body(new ZodValidationPipe(themeDataSchema)) body: { data?: unknown },
  ): Promise<DetailResponse<ThemeSaveResult>> {
    return ok(req, await this.themes.save(s.store_id, id, body.data));
  }

  @Post(":id/publish")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.THEMES_WRITE)
  @ApiZodBody(noBody)
  @ApiOperation({ summary: "Make this theme live with its saved changes" })
  async publish(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Theme")) id: string,
  ): Promise<DetailResponse<ThemeSummary>> {
    return ok(req, await this.themes.publish(s.store_id, id, actor(auth, req)));
  }

  @Post(":id/discard")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.THEMES_WRITE)
  @ApiZodBody(noBody)
  @ApiOperation({ summary: "Throw away unpublished changes on the live theme" })
  async discard(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Theme")) id: string,
  ): Promise<DetailResponse<ThemeSummary>> {
    return ok(req, await this.themes.discard(s.store_id, id, actor(auth, req)));
  }

  @Get(":id/versions")
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "Published versions, newest first" })
  async versions(
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Theme")) id: string,
  ): Promise<DetailResponse<ThemeVersionSummary[]>> {
    return ok(req, await this.themes.versions(s.store_id, id));
  }

  @Post(":id/versions/:versionId/restore")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.THEMES_WRITE)
  @ApiZodBody(noBody)
  @ApiOperation({ summary: "Roll back to a version (published right away on the live theme)" })
  async restore(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Theme")) id: string,
    @Param("versionId", uuid("Version")) versionId: string,
  ): Promise<DetailResponse<ThemeSummary>> {
    return ok(req, await this.themes.restore(s.store_id, id, versionId, actor(auth, req)));
  }

  @Post(":id/preview-link")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiZodBody(noBody)
  @ApiOperation({ summary: "A 1-hour token to preview the theme's saved changes" })
  async previewLink(
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Theme")) id: string,
  ): Promise<DetailResponse<ThemePreviewLink>> {
    return ok(req, await this.themes.previewLink(s.store_id, id));
  }
}

const KIND_PERMISSION = {
  product: PERMISSIONS.PRODUCTS_WRITE,
  collection: PERMISSIONS.COLLECTIONS_WRITE,
  page: PERMISSIONS.CONTENT_WRITE,
} as const;
const kindOf = (k: string): TemplateTargetKind => {
  if (k === "product" || k === "collection" || k === "page") return k;
  throw AppException.notFound("Resource");
};

/** Admin: which alternate theme template a product, collection or page uses. */
@ApiTags("online-store")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true })
@Controller("theme-templates")
export class ThemeTemplatesController {
  constructor(private readonly themes: ThemesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "Alternate template names in the live theme, per kind" })
  async names(
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
  ): Promise<DetailResponse<ThemeTemplateNames>> {
    return ok(req, await this.themes.templateNames(s.store_id));
  }

  @Get(":kind/:id")
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "The template a product, collection or page uses" })
  async get(
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Param("kind") kind: string,
    @Param("id", uuid("Resource")) id: string,
  ): Promise<DetailResponse<TemplateAssignment>> {
    return ok(req, await this.themes.assignment(s.store_id, kindOf(kind), id));
  }

  @Put(":kind/:id")
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiZodBody(templateAssignSchema)
  @ApiOperation({
    summary: "Choose a template (null = default); needs the kind's write permission",
  })
  async set(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Param("kind") kind: string,
    @Param("id", uuid("Resource")) id: string,
    @Body(new ZodValidationPipe(templateAssignSchema)) body: { template: string | null },
  ): Promise<DetailResponse<TemplateAssignment>> {
    const k = kindOf(kind);
    if (!s.permissions.has(KIND_PERMISSION[k])) throw AppException.forbidden();
    return ok(req, await this.themes.assign(s.store_id, k, id, body.template, actor(auth, req)));
  }
}

/** Admin: Online store → Navigation. */
@ApiTags("online-store")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true })
@InvalidatesStorefront()
@Controller("menus")
export class MenusController {
  constructor(private readonly menus: MenusService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "Menus (main and footer menus are created on first use)" })
  async list(
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
  ): Promise<DetailResponse<MenuView[]>> {
    return ok(req, await this.menus.list(s.store_id));
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "One menu" })
  async get(
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Menu")) id: string,
  ): Promise<DetailResponse<MenuView>> {
    return ok(req, await this.menus.get(s.store_id, id));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiZodBody(menuSchema)
  @ApiOperation({ summary: "Add a menu" })
  async create(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(menuSchema)) body: MenuData,
  ): Promise<DetailResponse<MenuView>> {
    return ok(req, await this.menus.create(s.store_id, body, actor(auth, req)));
  }

  @Put(":id")
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiZodBody(menuSchema)
  @ApiOperation({ summary: "Save a menu" })
  async update(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Menu")) id: string,
    @Body(new ZodValidationPipe(menuSchema)) body: MenuData,
  ): Promise<DetailResponse<MenuView>> {
    return ok(req, await this.menus.update(s.store_id, id, body, actor(auth, req)));
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: "Delete a menu" })
  async remove(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Menu")) id: string,
  ): Promise<void> {
    await this.menus.remove(s.store_id, id, actor(auth, req));
  }
}

/** Admin: Online store → Pages. */
@ApiTags("online-store")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true })
@InvalidatesStorefront()
@Controller("pages")
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "Content pages" })
  async list(
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
  ): Promise<DetailResponse<PageView[]>> {
    return ok(req, await this.pages.list(s.store_id));
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "One page" })
  async get(
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Page")) id: string,
  ): Promise<DetailResponse<PageView>> {
    return ok(req, await this.pages.get(s.store_id, id));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiZodBody(pageSchema)
  @ApiOperation({ summary: "Add a page" })
  async create(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(pageSchema)) body: PageData,
  ): Promise<DetailResponse<PageView>> {
    return ok(req, await this.pages.create(s.store_id, body, actor(auth, req)));
  }

  @Put(":id")
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiZodBody(pageSchema)
  @ApiOperation({ summary: "Save a page" })
  async update(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Page")) id: string,
    @Body(new ZodValidationPipe(pageSchema)) body: PageData,
  ): Promise<DetailResponse<PageView>> {
    return ok(req, await this.pages.update(s.store_id, id, body, actor(auth, req)));
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: "Delete a page" })
  async remove(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() s: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Page")) id: string,
  ): Promise<void> {
    await this.pages.remove(s.store_id, id, actor(auth, req));
  }
}

/** Storefront: the theme to render, and content pages. */
@ApiTags("storefront")
@ApiHeader({ name: "X-Store-Id", required: true })
@ApiHeader({ name: "X-Theme-Preview", required: false, description: "Theme preview token" })
@Public()
@Controller("storefront")
export class StorefrontOnlineStoreController {
  constructor(
    private readonly storefront: StorefrontService,
    private readonly themes: ThemesService,
    private readonly pages: PagesService,
    private readonly previews: ThemePreviewTokens,
  ) {}

  private preview(req: Request) {
    const t = req.get("x-theme-preview");
    return t && t.length < 1000 ? t : undefined;
  }

  @Get("theme")
  @ApiOperation({ summary: "The live theme (or a previewed draft) with its images and menus" })
  async theme(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DetailResponse<StorefrontThemePayload>> {
    const store = await this.storefront.assertStore(req.get(HEADERS.STORE_ID));
    const token = this.preview(req);
    const data = await this.themes.forStorefront(store.id, token);
    res.setHeader(
      "Cache-Control",
      data.preview ? "private, no-store" : "public, max-age=0, must-revalidate",
    );
    return ok(req, data);
  }

  @Get("pages")
  @ApiOperation({ summary: "Published pages (for sitemaps)" })
  async list(@Req() req: Request) {
    const store = await this.storefront.assertStore(req.get(HEADERS.STORE_ID));
    return ok(req, await this.pages.publishedList(store.id));
  }

  @Get("pages/:handle")
  @ApiOperation({ summary: "A published page (drafts too while previewing a theme)" })
  async page(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("handle") handle: string,
  ): Promise<DetailResponse<StorefrontPage>> {
    const store = await this.storefront.assertStore(req.get(HEADERS.STORE_ID));
    const token = this.preview(req);
    const preview = !!token && !!this.previews.verify(token, store.id);
    if (preview) res.setHeader("Cache-Control", "private, no-store");
    return ok(req, await this.pages.forStorefront(store.id, handle.slice(0, 255), preview));
  }
}
