import { Controller, Get, Param, ParseUUIDPipe, Query, Req, Res } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import {
  HEADERS,
  type DetailResponse,
  type ListResponse,
  type StorefrontCategory,
  type StorefrontCategoryDetail,
  type StorefrontCollectionSummary,
  type StorefrontPreviewProduct,
  type StorefrontProduct,
  type StorefrontSitemap,
  type StorefrontStore,
} from "@cartforge/types";
import {
  handleSchema,
  storefrontListQuerySchema,
  type StorefrontListQuery,
} from "@cartforge/validation";
import { Public } from "../auth/decorators";
import { AppException } from "../common/app-exception";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PreviewTokens } from "./preview-token";
import { StorefrontRedirect, StorefrontService } from "./storefront.service";

/**
 * Not cached by shared caches: the storefront app is the cache layer (tagged
 * ISR, purged on every catalog write). A CDN copy here would outlive a purge.
 */
const CACHE = "public, max-age=0, must-revalidate";
const NO_STORE = "private, no-store";

const handlePipe = new ZodValidationPipe(handleSchema);

/**
 * Public, unauthenticated catalog used by the storefront (Next 2). The store is
 * chosen with X-Store-Id until custom domains map to stores (Next 1).
 */
/** `?market=<id>` on catalog reads (part of the URL so caches keep markets apart). */
const marketParam = (req: Request) =>
  typeof req.query.market === "string" ? req.query.market.slice(0, 40) : undefined;

@ApiTags("storefront")
@ApiHeader({ name: "X-Store-Id", required: true, description: "Store (UUID)" })
@Public()
@Controller("storefront")
export class StorefrontController {
  constructor(
    private readonly storefront: StorefrontService,
    private readonly previews: PreviewTokens,
  ) {}

  @Get("store")
  @ApiOperation({ summary: "Store name, currency and locale" })
  async store(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DetailResponse<StorefrontStore>> {
    const store = await this.storefront.assertStore(req.get(HEADERS.STORE_ID));
    res.setHeader("Cache-Control", CACHE);
    return { data: store, request_id: String(req.id) };
  }

  @Get("categories")
  @ApiOperation({ summary: "Visible category tree in display order, with product counts" })
  async categories(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: StorefrontCategory[]; request_id: string }> {
    const store = await this.storefront.assertStore(req.get(HEADERS.STORE_ID));
    res.setHeader("Cache-Control", CACHE);
    return { data: await this.storefront.categories(store.id), request_id: String(req.id) };
  }

  @Get("categories/:handle")
  @ApiOperation({ summary: "Category with breadcrumb ancestors, children and SEO" })
  async category(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("handle", handlePipe) handle: string,
  ): Promise<DetailResponse<StorefrontCategoryDetail>> {
    const store = await this.storefront.assertStore(req.get(HEADERS.STORE_ID));
    res.setHeader("Cache-Control", CACHE);
    return { data: await this.storefront.category(store.id, handle), request_id: String(req.id) };
  }

  @Get("collections")
  @ApiOperation({ summary: "Active collections" })
  async collectionList(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: StorefrontCollectionSummary[]; request_id: string }> {
    const store = await this.storefront.assertStore(req.get(HEADERS.STORE_ID));
    res.setHeader("Cache-Control", CACHE);
    return { data: await this.storefront.collections(store.id), request_id: String(req.id) };
  }

  @Get("sitemap")
  @ApiOperation({ summary: "Indexable handles with last-modified times, for sitemap.xml" })
  async sitemap(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DetailResponse<StorefrontSitemap>> {
    const store = await this.storefront.assertStore(req.get(HEADERS.STORE_ID));
    res.setHeader("Cache-Control", CACHE);
    return { data: await this.storefront.sitemap(store.id), request_id: String(req.id) };
  }

  @Get("preview/products/:id")
  @ApiOperation({
    summary: "Any product (incl. drafts) with a signed preview token from the admin",
  })
  @ApiQuery({ name: "token", required: true })
  async preview(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("id", new ParseUUIDPipe({ exceptionFactory: () => AppException.notFound("Product") }))
    id: string,
    @Query("token") token: unknown,
  ): Promise<DetailResponse<StorefrontPreviewProduct>> {
    res.setHeader("Cache-Control", NO_STORE);
    res.setHeader("X-Robots-Tag", "noindex");
    const store = await this.storefront.assertStore(req.get(HEADERS.STORE_ID));
    const allowed = typeof token === "string" ? this.previews.verify(token, store.id) : null;
    // Wrong, expired or foreign tokens look exactly like a missing product.
    if (allowed !== id) throw AppException.notFound("Product");
    return {
      data: await this.storefront.preview(
        store.id,
        await this.storefront.market(store.id, marketParam(req)),
        id,
      ),
      request_id: String(req.id),
    };
  }

  @Get("products")
  @ApiOperation({
    summary: "Active products (filters: q, collection, category incl. subcategories; sort)",
  })
  async list(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query(new ZodValidationPipe(storefrontListQuerySchema)) q: StorefrontListQuery,
  ): Promise<ListResponse<StorefrontProduct>> {
    const store = await this.storefront.assertStore(req.get(HEADERS.STORE_ID));
    res.setHeader("Cache-Control", CACHE);
    return {
      ...(await this.storefront.list(
        store.id,
        await this.storefront.market(store.id, q.market),
        q,
      )),
      request_id: String(req.id),
    };
  }

  @Get("products/:handle")
  @ApiOperation({ summary: "Active product by handle; 301 to the new handle after a rename" })
  async product(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("handle", handlePipe) handle: string,
  ): Promise<DetailResponse<StorefrontProduct> | { redirect_to: string; request_id: string }> {
    const store = await this.storefront.assertStore(req.get(HEADERS.STORE_ID));
    try {
      res.setHeader("Cache-Control", CACHE);
      return {
        data: await this.storefront.byHandle(
          store.id,
          await this.storefront.market(store.id, marketParam(req)),
          handle,
        ),
        request_id: String(req.id),
      };
    } catch (err) {
      if (err instanceof StorefrontRedirect) return this.redirect(res, req, err.to, "products");
      throw err;
    }
  }

  @Get("collections/:handle")
  @ApiOperation({
    summary: "Active collection by handle (use /storefront/products?collection= for its products)",
  })
  async collection(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("handle", handlePipe) handle: string,
  ) {
    const store = await this.storefront.assertStore(req.get(HEADERS.STORE_ID));
    try {
      res.setHeader("Cache-Control", CACHE);
      return {
        data: await this.storefront.collection(store.id, handle),
        request_id: String(req.id),
      };
    } catch (err) {
      if (err instanceof StorefrontRedirect) return this.redirect(res, req, err.to, "collections");
      throw err;
    }
  }

  private redirect(res: Response, req: Request, to: string, kind: "products" | "collections") {
    const handle = to.split("/").pop();
    if (!handle) throw AppException.notFound("Resource");
    res.status(301).setHeader("Location", `/api/v1/storefront/${kind}/${handle}`);
    return { redirect_to: to, request_id: String(req.id) };
  }
}
