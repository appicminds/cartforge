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
  COMMERCE_HEADERS,
  HEADERS,
  PAYMENT_PROVIDERS_INFO,
  PERMISSIONS,
  type DetailResponse,
  type PaymentAccountView,
  type PaymentRedirect,
  type ProviderInfo,
} from "@cartforge/types";
import { paymentAccountSchema, type PaymentAccountUpdate } from "@cartforge/validation";
import { z } from "zod";
import { CurrentAuth, CurrentStore, Public, RequirePermissions } from "../../auth/decorators";
import { AppException } from "../../common/app-exception";
import { ApiZodBody } from "../../common/openapi";
import type { AuthContext, StoreContext } from "../../common/request-context";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { StorefrontService } from "../../storefront/storefront.service";
import { PaymentAccountsService } from "./accounts.service";
import { PaymentHubService } from "./payment-hub.service";

const NO_STORE = "private, no-store";
const uuid = (what: string) =>
  new ParseUUIDPipe({ exceptionFactory: () => AppException.notFound(what) });
const providerKey = (p: string) => {
  if (!/^[a-z]{3,20}$/.test(p)) throw AppException.notFound("Payment provider");
  return p;
};

/** Settings → Payments: connect online providers (credentials are write-only). */
@ApiTags("payments")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true })
@Controller("payments")
export class PaymentsAdminController {
  constructor(private readonly accounts: PaymentAccountsService) {}

  @Get("providers")
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "Online payment providers and this store's connections (no secrets)" })
  async providers(
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
  ): Promise<DetailResponse<{ providers: ProviderInfo[]; accounts: PaymentAccountView[] }>> {
    return {
      data: {
        providers: PAYMENT_PROVIDERS_INFO,
        accounts: await this.accounts.list(store.store_id),
      },
      request_id: String(req.id),
    };
  }

  @Put("accounts/:provider")
  @RequirePermissions(PERMISSIONS.PAYMENTS_SECRETS)
  @ApiZodBody(paymentAccountSchema)
  @ApiOperation({ summary: "Connect or update a provider. Empty secrets keep the saved ones." })
  async save(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("provider") provider: string,
    @Body(new ZodValidationPipe(paymentAccountSchema)) body: PaymentAccountUpdate,
  ): Promise<DetailResponse<PaymentAccountView[]>> {
    await this.accounts.save(store.store_id, providerKey(provider), body, {
      user_id: auth.user_id,
      request_id: String(req.id),
    });
    return { data: await this.accounts.list(store.store_id), request_id: String(req.id) };
  }

  @Delete("accounts/:provider")
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.PAYMENTS_SECRETS)
  @ApiOperation({ summary: "Disconnect a provider and delete its saved credentials" })
  async remove(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("provider") provider: string,
  ): Promise<void> {
    await this.accounts.remove(store.store_id, providerKey(provider), {
      user_id: auth.user_id,
      request_id: String(req.id),
    });
  }
}

/** Server-to-server notifications from providers (verified by signature, never by session). */
@ApiTags("payments")
@Public()
@Controller("payments/webhooks")
export class PaymentWebhooksController {
  constructor(private readonly hub: PaymentHubService) {}

  @Post(":provider/:storeId")
  @HttpCode(200)
  @ApiOperation({ summary: "Provider webhook / IPN endpoint (one per store and provider)" })
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Res({ passthrough: true }) res: Response,
    @Param("provider") provider: string,
    @Param("storeId", uuid("Store")) storeId: string,
  ): Promise<unknown> {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v]),
    );
    const respond = await this.hub.handleWebhook(storeId, providerKey(provider), raw, headers);
    if (respond) {
      res.status(respond.status);
      return respond.body;
    }
    return { received: true };
  }
}

const returnSchema = z
  .object({ params: z.record(z.string().max(100), z.string().max(4000)) })
  .strict()
  .refine((v) => Object.keys(v.params).length <= 60, "Too many parameters");

/** Shopper-facing: start paying, and hand back what the provider sent on return. */
@ApiTags("storefront")
@ApiHeader({ name: "X-Store-Id", required: true })
@Public()
@Controller("storefront")
export class StorefrontPaymentsController {
  constructor(
    private readonly hub: PaymentHubService,
    private readonly storefront: StorefrontService,
  ) {}

  @Post("orders/:id/payment")
  @HttpCode(200)
  @ApiHeader({ name: "X-Order-Key", required: true })
  @ApiOperation({
    summary: "Start (or retry) paying an order online; answers where to send the shopper",
  })
  async start(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("id", uuid("Order")) id: string,
  ): Promise<DetailResponse<PaymentRedirect>> {
    res.setHeader("Cache-Control", NO_STORE);
    const store = await this.storefront.assertStore(req.get(HEADERS.STORE_ID));
    return {
      data: await this.hub.start(store.id, id, req.get(COMMERCE_HEADERS.ORDER_KEY)),
      request_id: String(req.id),
    };
  }

  @Post("payments/:provider/return")
  @HttpCode(200)
  @ApiZodBody(returnSchema)
  @ApiOperation({ summary: "What the provider sent when the shopper came back (verified here)" })
  async returned(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("provider") provider: string,
    @Body(new ZodValidationPipe(returnSchema)) body: z.infer<typeof returnSchema>,
  ): Promise<
    DetailResponse<{ order_id: string | null; outcome: string; redirect: PaymentRedirect | null }>
  > {
    res.setHeader("Cache-Control", NO_STORE);
    const store = await this.storefront.assertStore(req.get(HEADERS.STORE_ID));
    return {
      data: await this.hub.handleReturn(store.id, providerKey(provider), body.params),
      request_id: String(req.id),
    };
  }
}
