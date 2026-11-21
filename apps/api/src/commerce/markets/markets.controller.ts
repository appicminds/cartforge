import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
} from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import {
  HEADERS,
  PERMISSIONS,
  type DetailResponse,
  type MarketsOverview,
  type MarketView,
  type ProductMarketsView,
  type StorefrontMarket,
} from "@cartforge/types";
import {
  marketSchema,
  productMarketsSchema,
  type MarketData,
  type ProductMarketsInput,
} from "@cartforge/validation";
import { CurrentAuth, CurrentStore, Public, RequirePermissions } from "../../auth/decorators";
import { AppException } from "../../common/app-exception";
import { ApiZodBody } from "../../common/openapi";
import type { AuthContext, StoreContext } from "../../common/request-context";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { InvalidatesStorefront } from "../../storefront/revalidation";
import { StorefrontService } from "../../storefront/storefront.service";
import { MarketsService } from "./markets.service";

const uuid = (what: string) =>
  new ParseUUIDPipe({ exceptionFactory: () => AppException.notFound(what) });
const actor = (auth: AuthContext, req: Request) => ({
  user_id: auth.user_id,
  request_id: String(req.id),
});

/** Admin: Settings → Markets, and a product's markets. */
@ApiTags("markets")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true })
@InvalidatesStorefront()
@Controller()
export class MarketsController {
  constructor(private readonly markets: MarketsService) {}

  @Get("markets")
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "Markets with their rates and an example price" })
  async list(
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
  ): Promise<DetailResponse<MarketsOverview>> {
    return { data: await this.markets.overview(store.store_id), request_id: String(req.id) };
  }

  @Post("markets")
  @RequirePermissions(PERMISSIONS.STORE_SETTINGS_WRITE)
  @ApiZodBody(marketSchema)
  @ApiOperation({ summary: "Add a market" })
  async create(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(marketSchema)) body: MarketData,
  ): Promise<DetailResponse<MarketView>> {
    return {
      data: await this.markets.create(store.store_id, body, actor(auth, req)),
      request_id: String(req.id),
    };
  }

  @Put("markets/:id")
  @RequirePermissions(PERMISSIONS.STORE_SETTINGS_WRITE)
  @ApiZodBody(marketSchema)
  @ApiOperation({ summary: "Edit a market (the primary market keeps the store currency)" })
  async update(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Market")) id: string,
    @Body(new ZodValidationPipe(marketSchema)) body: MarketData,
  ): Promise<DetailResponse<MarketView>> {
    return {
      data: await this.markets.update(store.store_id, id, body, actor(auth, req)),
      request_id: String(req.id),
    };
  }

  @Delete("markets/:id")
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.STORE_SETTINGS_WRITE)
  @ApiOperation({ summary: "Delete a market (not the primary one)" })
  async remove(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Market")) id: string,
  ): Promise<void> {
    await this.markets.remove(store.store_id, id, actor(auth, req));
  }

  @Get("products/:id/markets")
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  @ApiOperation({ summary: "Where a product is sold and its fixed prices per market" })
  async productMarkets(
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Product")) id: string,
  ): Promise<DetailResponse<ProductMarketsView>> {
    return {
      data: await this.markets.productMarkets(store.store_id, id),
      request_id: String(req.id),
    };
  }

  @Put("products/:id/markets")
  @RequirePermissions(PERMISSIONS.PRODUCTS_WRITE)
  @ApiZodBody(productMarketsSchema)
  @ApiOperation({
    summary: "Hide a product from markets and set fixed prices (price_minor null = converted)",
  })
  async saveProductMarkets(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Product")) id: string,
    @Body(new ZodValidationPipe(productMarketsSchema)) body: Required<ProductMarketsInput>,
  ): Promise<DetailResponse<ProductMarketsView>> {
    return {
      data: await this.markets.saveProductMarkets(store.store_id, id, body, actor(auth, req)),
      request_id: String(req.id),
    };
  }
}

/** Storefront: the markets a shopper can choose from. */
@ApiTags("storefront")
@ApiHeader({ name: "X-Store-Id", required: true })
@Public()
@Controller("storefront/markets")
export class StorefrontMarketsController {
  constructor(
    private readonly markets: MarketsService,
    private readonly storefront: StorefrontService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Active markets (id "primary" = the store\'s own currency)' })
  async list(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DetailResponse<StorefrontMarket[]>> {
    const store = await this.storefront.assertStore(req.get(HEADERS.STORE_ID));
    res.setHeader("Cache-Control", "public, max-age=60");
    return { data: await this.markets.storefrontList(store.id), request_id: String(req.id) };
  }
}
