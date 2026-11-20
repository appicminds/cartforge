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
  Query,
  Req,
} from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  COMMERCE_ERROR_CODES,
  PERMISSIONS,
  type DetailResponse,
  type ListResponse,
  type OrderDetail,
  type OrderListItem,
  type ShippingMethodView,
} from "@cartforge/types";
import {
  checkoutSettingsSchema,
  orderListQuerySchema,
  shippingMethodSchema,
  type CheckoutSettings,
  type OrderListQuery,
} from "@cartforge/validation";
import { CurrentAuth, CurrentStore, RequirePermissions } from "../auth/decorators";
import { AppException } from "../common/app-exception";
import { ApiZodBody } from "../common/openapi";
import type { AuthContext, StoreContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { InvalidatesStorefront } from "../storefront/revalidation";
import { OrdersService } from "./orders.service";
import { CommerceSettingsService, toShippingView, type SettingsActor } from "./settings.service";
import { HttpStatus } from "@nestjs/common";

const shippingId = new ParseUUIDPipe({
  exceptionFactory: () =>
    new AppException(
      COMMERCE_ERROR_CODES.SHIPPING_METHOD_NOT_FOUND,
      "Shipping method not found.",
      HttpStatus.NOT_FOUND,
    ),
});
const orderId = new ParseUUIDPipe({ exceptionFactory: () => AppException.notFound("Order") });
const shippingUpdateSchema = shippingMethodSchema.partial().strict();

const actor = (auth: AuthContext, store: StoreContext, req: Request): SettingsActor => ({
  store_id: store.store_id,
  user_id: auth.user_id,
  request_id: String(req.id),
});

@ApiTags("settings")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true, description: "Store scope (UUID)" })
@Controller()
export class CommerceAdminController {
  constructor(
    private readonly settings: CommerceSettingsService,
    private readonly orders: OrdersService,
  ) {}

  @Get("settings/checkout")
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "Checkout settings: tax, payment methods, terms, custom fields" })
  async getSettings(
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
  ): Promise<DetailResponse<CheckoutSettings>> {
    return { data: await this.settings.get(store.store_id), request_id: String(req.id) };
  }

  @Put("settings/checkout")
  @RequirePermissions(PERMISSIONS.STORE_SETTINGS_WRITE)
  @ApiZodBody(checkoutSettingsSchema)
  @ApiOperation({ summary: "Replace checkout settings" })
  async putSettings(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(checkoutSettingsSchema)) body: CheckoutSettings,
  ): Promise<DetailResponse<CheckoutSettings>> {
    return {
      data: await this.settings.update(body, actor(auth, store, req)),
      request_id: String(req.id),
    };
  }

  @Get("shipping-methods")
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "Flat-rate shipping methods" })
  async listShipping(
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
  ): Promise<{ data: ShippingMethodView[]; request_id: string }> {
    return {
      data: (await this.settings.shippingMethods(store.store_id)).map(toShippingView),
      request_id: String(req.id),
    };
  }

  @Post("shipping-methods")
  @RequirePermissions(PERMISSIONS.STORE_SETTINGS_WRITE)
  @InvalidatesStorefront(false)
  @ApiZodBody(shippingMethodSchema)
  @ApiOperation({ summary: "Add a shipping method" })
  async createShipping(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(shippingMethodSchema))
    body: ReturnType<typeof shippingMethodSchema.parse>,
  ): Promise<DetailResponse<ShippingMethodView>> {
    return {
      data: await this.settings.createShipping(body, actor(auth, store, req)),
      request_id: String(req.id),
    };
  }

  @Patch("shipping-methods/:id")
  @RequirePermissions(PERMISSIONS.STORE_SETTINGS_WRITE)
  @ApiZodBody(shippingUpdateSchema)
  @ApiOperation({ summary: "Edit a shipping method" })
  async updateShipping(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", shippingId) id: string,
    @Body(new ZodValidationPipe(shippingUpdateSchema))
    body: ReturnType<typeof shippingUpdateSchema.parse>,
  ): Promise<DetailResponse<ShippingMethodView>> {
    return {
      data: await this.settings.updateShipping(id, body, actor(auth, store, req)),
      request_id: String(req.id),
    };
  }

  @Delete("shipping-methods/:id")
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.STORE_SETTINGS_WRITE)
  @ApiOperation({ summary: "Delete a shipping method" })
  async deleteShipping(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", shippingId) id: string,
  ): Promise<void> {
    await this.settings.deleteShipping(id, actor(auth, store, req));
  }

  @Get("orders")
  @RequirePermissions(PERMISSIONS.ORDERS_READ)
  @ApiOperation({ summary: "Orders, newest first. q matches number, email or product title" })
  async listOrders(
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Query(new ZodValidationPipe(orderListQuerySchema)) q: OrderListQuery,
  ): Promise<ListResponse<OrderListItem>> {
    return { ...(await this.orders.list(store.store_id, q)), request_id: String(req.id) };
  }

  @Get("orders/:id")
  @RequirePermissions(PERMISSIONS.ORDERS_READ)
  @ApiOperation({ summary: "Order with items, addresses, totals, payments and timeline" })
  async getOrder(
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", orderId) id: string,
  ): Promise<DetailResponse<OrderDetail>> {
    return { data: await this.orders.detail(store.store_id, id), request_id: String(req.id) };
  }
}
