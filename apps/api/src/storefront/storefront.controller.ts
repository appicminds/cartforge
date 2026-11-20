import { Controller, Get, Param, Query, Req, Res } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import {
  HEADERS,
  type DetailResponse,
  type ListResponse,
  type StorefrontProduct,
} from "@cartforge/types";
import {
  handleSchema,
  storefrontListQuerySchema,
  type StorefrontListQuery,
} from "@cartforge/validation";
import { Public } from "../auth/decorators";
import { AppException } from "../common/app-exception";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { StorefrontRedirect, StorefrontService } from "./storefront.service";

/** Short shared cache; outbox events will purge on change once a CDN is configured. */
const CACHE = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

const handlePipe = new ZodValidationPipe(handleSchema);

/**
 * Public, unauthenticated catalog used by the storefront (Next 2). The store is
 * chosen with X-Store-Id until custom domains map to stores (Next 1).
 */
@ApiTags("storefront")
@ApiHeader({ name: "X-Store-Id", required: true, description: "Store (UUID)" })
@Public()
@Controller("storefront")
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}

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
      ...(await this.storefront.list(store.id, store.currency, q)),
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
        data: await this.storefront.byHandle(store.id, store.currency, handle),
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
