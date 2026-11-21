import { z } from "zod";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import {
  COMMERCE_ERROR_CODES,
  COMMERCE_HEADERS,
  HEADERS,
  type CartView,
  type CheckoutView,
  type DetailResponse,
  type OrderConfirmation,
  type PlacedOrder,
} from "@cartforge/types";
import {
  cartLineAddSchema,
  cartLineUpdateSchema,
  checkoutCompleteSchema,
  checkoutUpdateSchema,
  type CartLineAdd,
  type CheckoutUpdate,
} from "@cartforge/validation";
import { Public } from "../auth/decorators";
import { PrismaService } from "../prisma/prisma.service";
import { CustomerAccountsService } from "./customers/customer-accounts.service";
import { RateLimitService } from "../auth/rate-limit.service";
import { AppException } from "../common/app-exception";
import { ApiZodBody } from "../common/openapi";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { InvalidatesStorefront } from "../storefront/revalidation";
import { StorefrontService } from "../storefront/storefront.service";
import { HttpStatus } from "@nestjs/common";
import { CartService } from "./cart.service";
import { CheckoutService } from "./checkout.service";
import { IdempotencyService } from "./idempotency.service";
import { OrdersService } from "./orders.service";
import { ReservationsService } from "./reservations.service";

const NO_STORE = "private, no-store";
const lineId = new ParseUUIDPipe({
  exceptionFactory: () =>
    new AppException(
      COMMERCE_ERROR_CODES.CART_LINE_NOT_FOUND,
      "That item isn't in your cart any more.",
      HttpStatus.NOT_FOUND,
    ),
});
const orderId = new ParseUUIDPipe({ exceptionFactory: () => AppException.notFound("Order") });

/**
 * Shopper-facing cart and checkout (PRD §13). Public: identified by store
 * (X-Store-Id) and a secret cart token (X-Cart-Token), never by client-sent
 * prices. Called server-side by the storefront.
 */
const cartMarketSchema = z.object({ market_id: z.string().trim().min(1).max(40) }).strict();

@ApiTags("storefront")
@ApiHeader({ name: "X-Store-Id", required: true, description: "Store (UUID)" })
@Public()
@Controller("storefront")
export class StorefrontCommerceController {
  constructor(
    private readonly storefront: StorefrontService,
    private readonly carts: CartService,
    private readonly checkout: CheckoutService,
    private readonly orders: OrdersService,
    private readonly idempotency: IdempotencyService,
    private readonly reservations: ReservationsService,
    private readonly limits: RateLimitService,
    private readonly accounts: CustomerAccountsService,
    private readonly prisma: PrismaService,
  ) {}

  private async cart(req: Request, res: Response, opts: { allowConverted?: boolean } = {}) {
    res.setHeader("Cache-Control", NO_STORE);
    const store = await this.storefront.assertStore(req.get(HEADERS.STORE_ID));
    const cart = await this.carts.resolve(store.id, req.get(COMMERCE_HEADERS.CART_TOKEN), opts);
    await this.limits.hit(`cart:${cart.id}`, 300, 600);
    return cart;
  }

  @Post("cart")
  @ApiOperation({ summary: "Create a cart; returns its secret token once" })
  async createCart(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DetailResponse<{ token: string; cart: CartView }>> {
    res.setHeader("Cache-Control", NO_STORE);
    const store = await this.storefront.assertStore(req.get(HEADERS.STORE_ID));
    // Storefront servers share an IP; they forward the shopper's for fair limits.
    const ip = req.get("x-shopper-ip")?.slice(0, 64) || req.ip;
    await this.limits.hit(`cart-create:${store.id}:${ip}`, 60, 600);
    // X-Market: the shopper's market ("primary" or unknown = the store's own currency).
    const marketId = req.get("x-market")?.slice(0, 40);
    const market = await this.storefront.market(store.id, marketId);
    const { token, cart } = await this.carts.create(store.id, market);
    return { data: { token, cart: await this.carts.view(cart) }, request_id: String(req.id) };
  }

  @Get("cart")
  @ApiHeader({ name: "X-Cart-Token", required: true })
  @ApiOperation({ summary: "Cart, re-validated against the live catalog (notices report changes)" })
  async getCart(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DetailResponse<CartView>> {
    const cart = await this.cart(req, res);
    await this.reservations.sweep(cart.store_id, { throttle: true });
    return { data: await this.carts.view(cart), request_id: String(req.id) };
  }

  @Put("cart/market")
  @ApiHeader({ name: "X-Cart-Token", required: true })
  @ApiZodBody(cartMarketSchema)
  @ApiOperation({ summary: "Switch the cart to another market (re-prices it in that currency)" })
  async setMarket(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(cartMarketSchema)) body: { market_id: string },
  ): Promise<DetailResponse<CartView>> {
    const cart = await this.cart(req, res);
    const id = /^[0-9a-f-]{36}$/i.test(body.market_id) ? body.market_id : null;
    return { data: await this.carts.setMarket(cart, id), request_id: String(req.id) };
  }

  @Post("cart/lines")
  @ApiHeader({ name: "X-Cart-Token", required: true })
  @ApiZodBody(cartLineAddSchema)
  @ApiOperation({ summary: "Add a variant (quantities merge; capped at available stock)" })
  async addLine(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(cartLineAddSchema)) body: CartLineAdd,
  ): Promise<DetailResponse<CartView>> {
    const cart = await this.cart(req, res);
    await this.reservations.sweep(cart.store_id); // a stock decision: never use stale holds
    return {
      data: await this.carts.addLine(cart, body.variant_id, body.quantity),
      request_id: String(req.id),
    };
  }

  @Patch("cart/lines/:id")
  @ApiHeader({ name: "X-Cart-Token", required: true })
  @ApiZodBody(cartLineUpdateSchema)
  @ApiOperation({ summary: "Change a line's quantity (0 removes it)" })
  async updateLine(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("id", lineId) id: string,
    @Body(new ZodValidationPipe(cartLineUpdateSchema)) body: { quantity: number },
  ): Promise<DetailResponse<CartView>> {
    const cart = await this.cart(req, res);
    return {
      data: await this.carts.updateLine(cart, id, body.quantity),
      request_id: String(req.id),
    };
  }

  @Delete("cart/lines/:id")
  @ApiHeader({ name: "X-Cart-Token", required: true })
  @ApiOperation({ summary: "Remove a line" })
  async removeLine(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("id", lineId) id: string,
  ): Promise<DetailResponse<CartView>> {
    const cart = await this.cart(req, res);
    return { data: await this.carts.removeLine(cart, id), request_id: String(req.id) };
  }

  @Post("checkout")
  @HttpCode(200)
  @ApiHeader({ name: "X-Cart-Token", required: true })
  @ApiOperation({
    summary: "Start or resume checkout; holds stock for the store's reservation window",
  })
  async openCheckout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DetailResponse<CheckoutView>> {
    const cart = await this.cart(req, res);
    return { data: await this.checkout.open(cart), request_id: String(req.id) };
  }

  @Patch("checkout")
  @ApiHeader({ name: "X-Cart-Token", required: true })
  @ApiZodBody(checkoutUpdateSchema)
  @ApiOperation({
    summary: "Save contact, addresses, shipping/payment choices, custom fields, terms",
  })
  async updateCheckout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(checkoutUpdateSchema)) body: CheckoutUpdate,
  ): Promise<DetailResponse<CheckoutView>> {
    const cart = await this.cart(req, res);
    return { data: await this.checkout.update(cart, body), request_id: String(req.id) };
  }

  @Post("checkout/complete")
  @InvalidatesStorefront()
  @ApiHeader({ name: "X-Cart-Token", required: true })
  @ApiHeader({ name: "Idempotency-Key", required: true, description: "Unique per order attempt" })
  @ApiZodBody(checkoutCompleteSchema)
  @ApiOperation({
    summary:
      "Place the order: totals recomputed server-side; retries with the same key replay the result",
  })
  async complete(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(checkoutCompleteSchema)) body: { expected_total_minor?: number },
  ): Promise<DetailResponse<PlacedOrder>> {
    const cart = await this.cart(req, res, { allowConverted: true });
    await this.limits.hit(`checkout-complete:${cart.id}`, 20, 600);
    const result = await this.idempotency.run(
      {
        store_id: cart.store_id,
        scope: `checkout.complete:${cart.id}`,
        key: req.get(COMMERCE_HEADERS.IDEMPOTENCY_KEY),
        request: body,
      },
      async () => {
        // Next 7: a signed-in customer owns the order (instead of matching by email).
        const customerId = await this.accounts.resolve(cart.store_id, req.get("x-customer-token"));
        if (customerId && cart.customer_id !== customerId) {
          await this.prisma.cart.update({
            where: { id: cart.id },
            data: { customer_id: customerId },
          });
          cart.customer_id = customerId;
        }
        return { status: 201, body: await this.checkout.complete(cart, body.expected_total_minor) };
      },
    );
    res.status(result.status);
    if (result.replayed) res.setHeader("Idempotent-Replayed", "true");
    return { data: result.body, request_id: String(req.id) };
  }

  @Get("orders/:id")
  @ApiHeader({
    name: "X-Order-Key",
    required: true,
    description: "Secret from the order confirmation",
  })
  @ApiOperation({ summary: "Order status page for the customer" })
  async order(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("id", orderId) id: string,
  ): Promise<DetailResponse<OrderConfirmation>> {
    res.setHeader("Cache-Control", NO_STORE);
    res.setHeader("X-Robots-Tag", "noindex");
    const store = await this.storefront.assertStore(req.get(HEADERS.STORE_ID));
    return {
      data: await this.orders.forCustomer(store.id, id, req.get(COMMERCE_HEADERS.ORDER_KEY)),
      request_id: String(req.id),
    };
  }
}
