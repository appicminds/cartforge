import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import {
  COMMERCE_ERROR_CODES,
  PAYMENT_ERROR_CODES,
  providerInfo,
  type PaymentRedirect,
} from "@cartforge/types";
import { safeEqual, sha256 } from "../../auth/tokens";
import { AppException } from "../../common/app-exception";
import { PrismaService } from "../../prisma/prisma.service";
import { OrderActionsService } from "../order-actions.service";
import { PaymentAccountsService } from "./accounts.service";
import { ProviderError, SignatureError, type WebhookResult } from "./provider";
import { ONLINE_PROVIDERS, isOnlineProvider } from "./registry";

const notFound = () =>
  new AppException(COMMERCE_ERROR_CODES.ORDER_NOT_FOUND, "Order not found.", HttpStatus.NOT_FOUND);
const badSignature = () =>
  new AppException(
    PAYMENT_ERROR_CODES.PAYMENT_SIGNATURE_INVALID,
    "We couldn't verify this payment message.",
    HttpStatus.BAD_REQUEST,
  );

/**
 * Payment Hub (Next 5): starts hosted payments, and turns verified provider
 * messages (signed returns and webhooks) into order updates.
 */
@Injectable()
export class PaymentHubService {
  private readonly logger = new Logger(PaymentHubService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: PaymentAccountsService,
    private readonly orders: OrderActionsService,
  ) {}

  /**
   * Shopper wants to pay (right after checkout, or "Pay now" later). The order key
   * from the confirmation link is required. Each call starts a fresh attempt.
   */
  async start(storeId: string, orderId: string, key: string | undefined): Promise<PaymentRedirect> {
    const o = await this.prisma.order.findFirst({
      where: { id: orderId, store_id: storeId },
      include: {
        payments: { orderBy: { created_at: "asc" } },
        items: { select: { quantity: true } },
      },
    });
    if (
      !o?.access_key_hash ||
      !key ||
      key.length > 100 ||
      !safeEqual(o.access_key_hash, sha256(key))
    )
      throw notFound();
    const p = o.payments[0];
    if (!p || !isOnlineProvider(p.provider)) throw notFound();
    if (o.canceled_at || p.status !== "pending")
      throw new AppException(
        PAYMENT_ERROR_CODES.PAYMENT_NOT_PENDING,
        o.canceled_at ? "This order was canceled." : "This order is already paid.",
        HttpStatus.CONFLICT,
      );
    const ctx = await this.accounts.context(storeId, p.provider);
    if (!ctx)
      throw new AppException(
        PAYMENT_ERROR_CODES.PAYMENT_NOT_CONFIGURED,
        "This payment method isn't available any more. Contact the store.",
        HttpStatus.CONFLICT,
      );
    const adapter = ONLINE_PROVIDERS[p.provider];
    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { name: true },
    });
    try {
      const session = await adapter.createSession(ctx, {
        payment_id: p.id,
        order_id: o.id,
        order_number: o.number,
        amount_minor: Number(p.amount_minor),
        currency: p.currency,
        email: o.email,
        phone: o.phone,
        description: `${store.name} order ${o.number}`,
        return_url: await this.accounts.returnUrl(storeId, p.provider),
        cancel_url: await this.accounts.returnUrl(storeId, p.provider, "?cancel=1"),
        webhook_url: this.accounts.webhookUrl(storeId, p.provider),
      });
      await this.prisma.payment.update({
        where: { id: p.id },
        data: { provider_reference: session.reference, mode: ctx.mode, failure_reason: null },
      });
      return session.redirect;
    } catch (err) {
      const message =
        err instanceof ProviderError ? err.message : "The payment provider didn't respond.";
      if (!(err instanceof ProviderError))
        this.logger.error(`start ${p.provider}: ${(err as Error).message}`);
      await this.prisma.payment.update({
        where: { id: p.id },
        data: { failure_reason: message.slice(0, 500) },
      });
      throw new AppException(
        PAYMENT_ERROR_CODES.PAYMENT_PROVIDER_ERROR,
        `${providerInfo(p.provider)?.name ?? p.provider} couldn't start the payment. Try again in a moment.`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** The shopper came back from the provider (parameters forwarded by the storefront). */
  async handleReturn(
    storeId: string,
    provider: string,
    params: Record<string, string>,
  ): Promise<{ order_id: string | null; outcome: string; redirect: PaymentRedirect | null }> {
    if (!isOnlineProvider(provider)) throw AppException.notFound("Payment provider");
    const ctx = await this.accounts.context(storeId, provider);
    if (!ctx) throw AppException.notFound("Payment provider");
    try {
      const r = await ONLINE_PROVIDERS[provider].handleReturn(ctx, params);
      if (r.kind === "redirect") {
        const p = await this.prisma.payment.findFirst({
          where: { store_id: storeId, provider, provider_reference: r.reference },
          select: { order_id: true },
        });
        return { order_id: p?.order_id ?? null, outcome: "pending", redirect: r.redirect };
      }
      const { order_id } = await this.orders.applyProviderMessage(
        storeId,
        provider,
        r.message,
        "return",
      );
      return { order_id, outcome: r.message.outcome, redirect: null };
    } catch (err) {
      if (err instanceof SignatureError) {
        this.logger.warn(`return ${provider} for ${storeId}: ${err.message}`);
        throw badSignature();
      }
      if (err instanceof ProviderError)
        throw new AppException(
          PAYMENT_ERROR_CODES.PAYMENT_PROVIDER_ERROR,
          err.message,
          HttpStatus.BAD_GATEWAY,
        );
      throw err;
    }
  }

  /** Server-to-server notification. Unverifiable messages are rejected and logged. */
  async handleWebhook(
    storeId: string,
    provider: string,
    raw: Buffer,
    headers: Record<string, string | undefined>,
  ): Promise<WebhookResult["respond"]> {
    if (!isOnlineProvider(provider)) throw AppException.notFound("Payment provider");
    const adapter = ONLINE_PROVIDERS[provider];
    const ctx = await this.accounts.context(storeId, provider);
    if (!ctx || !adapter.handleWebhook) throw AppException.notFound("Payment provider");
    let result: WebhookResult;
    try {
      result = await adapter.handleWebhook(ctx, raw, headers);
    } catch (err) {
      if (err instanceof SignatureError || err instanceof SyntaxError) {
        this.logger.warn(`webhook ${provider} for ${storeId}: ${(err as Error).message}`);
        throw badSignature();
      }
      throw err;
    }
    if (result.message)
      await this.orders.applyProviderMessage(storeId, provider, result.message, "webhook");
    return result.respond;
  }
}
