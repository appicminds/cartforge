import { timingSafeEqual } from "node:crypto";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  PERMISSIONS,
  type DetailResponse,
  type ProductSaleInfo,
  type SaleDetail,
  type SaleEndResult,
  type SalePreview,
  type SaleView,
} from "@cartforge/types";
import {
  saleProductsSchema,
  saleRunningUpdateSchema,
  saleSchema,
  type SaleData,
} from "@cartforge/validation";
import { z } from "zod";
import { CurrentAuth, CurrentStore, Public, RequirePermissions } from "../../auth/decorators";
import { AppException } from "../../common/app-exception";
import { ApiZodBody } from "../../common/openapi";
import type { AuthContext, StoreContext } from "../../common/request-context";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { API_ENV, type ApiEnv } from "../../config/env";
import { SalesService } from "./sales.service";

/** Actions without a body. */
const noBody = z.object({}).strict();
const uuid = (what: string) =>
  new ParseUUIDPipe({ exceptionFactory: () => AppException.notFound(what) });
const actor = (auth: AuthContext, req: Request) => ({
  user_id: auth.user_id,
  request_id: String(req.id),
});

/** Admin: Discounts → Sales (bulk price changes). */
@ApiTags("sales")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true })
@Controller("sales")
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "Sales, newest first" })
  async list(
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
  ): Promise<DetailResponse<SaleView[]>> {
    return { data: await this.sales.list(store.store_id), request_id: String(req.id) };
  }

  @Post("preview")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.DISCOUNTS_WRITE)
  @ApiZodBody(saleSchema)
  @ApiOperation({ summary: "What a sale would change, before running it" })
  async preview(
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(saleSchema)) body: SaleData,
  ): Promise<DetailResponse<SalePreview>> {
    return { data: await this.sales.preview(store.store_id, body), request_id: String(req.id) };
  }

  @Get("product/:productId")
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "The running or scheduled sale a product is in" })
  async forProduct(
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("productId", uuid("Product")) productId: string,
  ): Promise<DetailResponse<ProductSaleInfo | null>> {
    return {
      data: await this.sales.forProduct(store.store_id, productId),
      request_id: String(req.id),
    };
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "One sale with its products" })
  async get(
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Sale")) id: string,
  ): Promise<DetailResponse<SaleDetail>> {
    return { data: await this.sales.get(store.store_id, id), request_id: String(req.id) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DISCOUNTS_WRITE)
  @ApiZodBody(saleSchema)
  @ApiOperation({ summary: "Run a sale now, or schedule it" })
  async create(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(saleSchema)) body: SaleData,
  ): Promise<DetailResponse<SaleView>> {
    return {
      data: await this.sales.create(store.store_id, body, actor(auth, req)),
      request_id: String(req.id),
    };
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.DISCOUNTS_WRITE)
  @ApiZodBody(z.union([saleSchema, saleRunningUpdateSchema]))
  @ApiOperation({ summary: "Edit a scheduled sale, or a running sale's name and end date" })
  async update(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Sale")) id: string,
    @Body() body: unknown,
  ): Promise<DetailResponse<SaleDetail>> {
    return {
      data: await this.sales.update(store.store_id, id, body, actor(auth, req)),
      request_id: String(req.id),
    };
  }

  @Post(":id/end")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.DISCOUNTS_WRITE)
  @ApiZodBody(noBody)
  @ApiOperation({ summary: "End a running sale now (prices go back), or cancel a scheduled one" })
  async end(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Sale")) id: string,
  ): Promise<DetailResponse<SaleEndResult>> {
    return {
      data: await this.sales.end(store.store_id, id, actor(auth, req)),
      request_id: String(req.id),
    };
  }

  @Post(":id/remove-products")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.DISCOUNTS_WRITE)
  @ApiZodBody(saleProductsSchema)
  @ApiOperation({ summary: "Take products out of a running sale (their prices go back)" })
  async removeProducts(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Sale")) id: string,
    @Body(new ZodValidationPipe(saleProductsSchema)) body: { product_ids: string[] },
  ): Promise<DetailResponse<SaleEndResult>> {
    return {
      data: await this.sales.removeProducts(store.store_id, id, body.product_ids, actor(auth, req)),
      request_id: String(req.id),
    };
  }

  @Post(":id/apply-new")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.DISCOUNTS_WRITE)
  @ApiZodBody(noBody)
  @ApiOperation({ summary: "Add matching products that aren't in the running sale yet" })
  async applyNew(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Sale")) id: string,
  ): Promise<DetailResponse<{ added: number }>> {
    return {
      data: { added: await this.sales.applyNew(store.store_id, id, actor(auth, req)) },
      request_id: String(req.id),
    };
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.DISCOUNTS_WRITE)
  @ApiOperation({ summary: "Delete a sale that isn't running" })
  async remove(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Sale")) id: string,
  ): Promise<void> {
    await this.sales.remove(store.store_id, id, actor(auth, req));
  }
}

/** Scheduled starts and ends (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). */
@ApiTags("internal")
@Public()
@Controller("internal/cron")
export class SalesCronController {
  constructor(
    private readonly sales: SalesService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  @Get("sales")
  @ApiOperation({ summary: "Start and end sales that are due (cron)" })
  async run(@Req() req: Request): Promise<{ data: { processed: number } }> {
    const secret = this.env.CRON_SECRET;
    const given = Buffer.from(req.get("authorization") ?? "");
    const want = Buffer.from(`Bearer ${secret ?? ""}`);
    if (!secret || given.length !== want.length || !timingSafeEqual(given, want))
      throw AppException.notFound("Resource");
    return { data: { processed: await this.sales.catchUp(undefined, true) } };
  }
}
