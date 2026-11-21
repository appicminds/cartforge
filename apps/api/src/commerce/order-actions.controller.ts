import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { PERMISSIONS, type DetailResponse, type OrderDetail } from "@cartforge/types";
import {
  fulfillmentCreateSchema,
  orderCancelSchema,
  orderMarkPaidSchema,
  orderNoteSchema,
  refundCreateSchema,
  type FulfillmentCreate,
  type OrderCancel,
  type OrderMarkPaid,
  type OrderNote,
  type RefundCreate,
} from "@cartforge/validation";
import { CurrentAuth, CurrentStore, RequirePermissions } from "../auth/decorators";
import { AppException } from "../common/app-exception";
import { ApiZodBody } from "../common/openapi";
import type { AuthContext, StoreContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { InvalidatesStorefront } from "../storefront/revalidation";
import { OrderActionsService, type OrderActor } from "./order-actions.service";
import { OrdersService } from "./orders.service";

const uuid = (what: string) =>
  new ParseUUIDPipe({ exceptionFactory: () => AppException.notFound(what) });

/** Order processing (Next 6). Every action answers with the updated order. */
@ApiTags("orders")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true })
@Controller("orders/:id")
export class OrderActionsController {
  constructor(
    private readonly actions: OrderActionsService,
    private readonly orders: OrdersService,
  ) {}

  private actor(auth: AuthContext, store: StoreContext, req: Request): OrderActor {
    return {
      store_id: store.store_id,
      user_id: auth.user_id,
      can_refund: store.permissions.has(PERMISSIONS.ORDERS_REFUND),
      request_id: String(req.id),
    };
  }

  private async done(store: StoreContext, id: string, req: Request) {
    return { data: await this.orders.detail(store.store_id, id), request_id: String(req.id) };
  }

  @Post("mark-paid")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.ORDERS_WRITE)
  @ApiZodBody(orderMarkPaidSchema)
  @ApiOperation({ summary: "Record that the payment arrived (bank transfer, cash on delivery…)" })
  async markPaid(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Order")) id: string,
    @Body(new ZodValidationPipe(orderMarkPaidSchema)) body: OrderMarkPaid,
  ): Promise<DetailResponse<OrderDetail>> {
    await this.actions.markPaid(id, body, this.actor(auth, store, req));
    return this.done(store, id, req);
  }

  @Post("fulfillments")
  @HttpCode(201)
  @RequirePermissions(PERMISSIONS.ORDERS_WRITE)
  @ApiZodBody(fulfillmentCreateSchema)
  @ApiOperation({
    summary: "Ship items (all remaining when `items` is omitted), with optional tracking",
  })
  async fulfill(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Order")) id: string,
    @Body(new ZodValidationPipe(fulfillmentCreateSchema)) body: FulfillmentCreate,
  ): Promise<DetailResponse<OrderDetail>> {
    await this.actions.fulfill(id, body, this.actor(auth, store, req));
    return this.done(store, id, req);
  }

  @Post("fulfillments/:fulfillmentId/delivered")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.ORDERS_WRITE)
  @ApiOperation({ summary: "Mark a shipment as delivered" })
  async delivered(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Order")) id: string,
    @Param("fulfillmentId", uuid("Shipment")) fulfillmentId: string,
  ): Promise<DetailResponse<OrderDetail>> {
    await this.actions.markDelivered(id, fulfillmentId, this.actor(auth, store, req));
    return this.done(store, id, req);
  }

  @Post("cancel")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.ORDERS_WRITE)
  @InvalidatesStorefront()
  @ApiZodBody(orderCancelSchema)
  @ApiOperation({
    summary:
      "Cancel an unshipped order; restocks by default. Paid orders need `refund: true` (orders.refund).",
  })
  async cancel(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Order")) id: string,
    @Body(new ZodValidationPipe(orderCancelSchema)) body: OrderCancel,
  ): Promise<DetailResponse<OrderDetail>> {
    await this.actions.cancel(id, body, this.actor(auth, store, req));
    return this.done(store, id, req);
  }

  @Post("refunds")
  @HttpCode(201)
  @RequirePermissions(PERMISSIONS.ORDERS_REFUND)
  @InvalidatesStorefront()
  @ApiZodBody(refundCreateSchema)
  @ApiOperation({
    summary:
      "Record a refund: an amount (up to what's left) and, optionally, items to restock. Money goes back outside CartForge until the Payment Hub (Next 5).",
  })
  async refund(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Order")) id: string,
    @Body(new ZodValidationPipe(refundCreateSchema)) body: RefundCreate,
  ): Promise<DetailResponse<OrderDetail>> {
    await this.actions.refund(id, body, this.actor(auth, store, req));
    return this.done(store, id, req);
  }

  @Post("notes")
  @HttpCode(201)
  @RequirePermissions(PERMISSIONS.ORDERS_WRITE)
  @ApiZodBody(orderNoteSchema)
  @ApiOperation({ summary: "Add a staff note to the order timeline" })
  async note(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", uuid("Order")) id: string,
    @Body(new ZodValidationPipe(orderNoteSchema)) body: OrderNote,
  ): Promise<DetailResponse<OrderDetail>> {
    await this.actions.addNote(id, body.message, this.actor(auth, store, req));
    return this.done(store, id, req);
  }
}
