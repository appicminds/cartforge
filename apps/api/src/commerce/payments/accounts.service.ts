import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  PAYMENT_ERROR_CODES,
  PAYMENT_PROVIDERS_INFO,
  providerInfo,
  type OnlineProviderKey,
  type PaymentAccountView,
} from "@cartforge/types";
import type { PaymentAccountUpdate } from "@cartforge/validation";
import { AuditService } from "../../audit/audit.service";
import { AppException } from "../../common/app-exception";
import { SecretBox } from "../../common/secret-box";
import { API_ENV, type ApiEnv } from "../../config/env";
import { DomainsService } from "../../platform/domains.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PAYMENT_HTTP, type PaymentHttp, type ProviderContext } from "./provider";
import { isOnlineProvider } from "./registry";

const notConfigured = (message: string) =>
  new AppException(
    PAYMENT_ERROR_CODES.PAYMENT_NOT_CONFIGURED,
    message,
    HttpStatus.UNPROCESSABLE_ENTITY,
  );

/** A store's provider connections; credentials encrypted at rest and never returned. */
@Injectable()
export class PaymentAccountsService {
  private readonly box: SecretBox;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly domains: DomainsService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(PAYMENT_HTTP) private readonly http: PaymentHttp,
  ) {
    this.box = new SecretBox(env.APP_ENCRYPTION_KEY);
  }

  webhookUrl(storeId: string, provider: string): string {
    const base = this.env.ADMIN_URL ?? this.env.ADMIN_ORIGIN[0]!;
    return `${base}/api/v1/payments/webhooks/${provider}/${storeId}`;
  }

  async returnUrl(storeId: string, provider: string, extra = ""): Promise<string> {
    const path = `/checkout/return/${provider}${extra}`;
    return (await this.domains.storefrontLink(storeId, path)) ?? path;
  }

  private open(sealed: string): Record<string, string> {
    try {
      return JSON.parse(this.box.open(sealed)) as Record<string, string>;
    } catch {
      return {};
    }
  }

  async list(storeId: string): Promise<PaymentAccountView[]> {
    const rows = await this.prisma.paymentAccount.findMany({ where: { store_id: storeId } });
    return Promise.all(
      PAYMENT_PROVIDERS_INFO.map(async (info) => {
        const row = rows.find((r) => r.provider === info.key);
        const creds = row ? this.open(row.credentials) : {};
        return {
          provider: info.key,
          connected: !!row,
          mode: (row?.mode ?? "test") as "test" | "live",
          enabled: row?.enabled ?? false,
          values: Object.fromEntries(
            info.fields.filter((f) => !f.secret && creds[f.key]).map((f) => [f.key, creds[f.key]!]),
          ),
          set_fields: info.fields.filter((f) => !!creds[f.key]).map((f) => f.key),
          webhook_url: this.webhookUrl(storeId, info.key),
          return_url: await this.returnUrl(storeId, info.key),
          updated_at: row?.updated_at.toISOString() ?? null,
        };
      }),
    );
  }

  async save(
    storeId: string,
    provider: string,
    input: PaymentAccountUpdate,
    actor: { user_id: string; request_id?: string },
  ): Promise<void> {
    const info = providerInfo(provider);
    if (!info || !isOnlineProvider(provider)) throw AppException.notFound("Payment provider");
    const row = await this.prisma.paymentAccount.findUnique({
      where: { store_id_provider: { store_id: storeId, provider } },
    });
    const creds = row ? this.open(row.credentials) : {};
    const known = new Set(info.fields.map((f) => f.key));
    for (const [k, v] of Object.entries(input.credentials)) {
      if (!known.has(k)) throw notConfigured(`Unknown setting "${k}" for ${info.name}.`);
      if (v) creds[k] = v;
    }
    const missing = info.fields.filter((f) => f.required && !creds[f.key]);
    if (input.enabled && missing.length)
      throw new AppException(
        PAYMENT_ERROR_CODES.PAYMENT_NOT_CONFIGURED,
        `Fill in ${missing.map((f) => f.label).join(", ")} before turning ${info.name} on.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        missing.map((f) => ({
          path: `credentials.${f.key}`,
          message: "Required",
          code: "required",
        })),
      );
    if (provider === "stripe" && creds.secret_key) {
      const want = input.mode === "live" ? "sk_live_" : "sk_test_";
      if (!creds.secret_key.startsWith(want))
        throw new AppException(
          PAYMENT_ERROR_CODES.PAYMENT_NOT_CONFIGURED,
          `${input.mode === "live" ? "Live" : "Test"} mode needs a secret key starting with ${want}.`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          [{ path: "credentials.secret_key", message: `Should start with ${want}`, code: "mode" }],
        );
    }
    const sealed = this.box.seal(JSON.stringify(creds));
    await this.prisma.paymentAccount.upsert({
      where: { store_id_provider: { store_id: storeId, provider } },
      create: {
        store_id: storeId,
        provider,
        mode: input.mode,
        enabled: input.enabled,
        credentials: sealed,
      },
      update: { mode: input.mode, enabled: input.enabled, credentials: sealed },
    });
    await this.audit.record({
      action: "payments.account_saved",
      resource_type: "payment_account",
      resource_id: provider,
      store_id: storeId,
      actor_user_id: actor.user_id,
      // Which fields changed, never their values.
      metadata: {
        mode: input.mode,
        enabled: String(input.enabled),
        changed: Object.keys(input.credentials)
          .filter((k) => input.credentials[k])
          .join(","),
      },
      request_id: actor.request_id,
    });
  }

  async remove(storeId: string, provider: string, actor: { user_id: string; request_id?: string }) {
    const r = await this.prisma.paymentAccount.deleteMany({
      where: { store_id: storeId, provider },
    });
    if (!r.count) throw AppException.notFound("Payment provider");
    await this.audit.record({
      action: "payments.account_removed",
      resource_type: "payment_account",
      resource_id: provider,
      store_id: storeId,
      actor_user_id: actor.user_id,
      request_id: actor.request_id,
    });
  }

  /** Credentials and endpoints for one provider (enabled or not: old payments still need them). */
  async context(storeId: string, provider: OnlineProviderKey): Promise<ProviderContext | null> {
    const row = await this.prisma.paymentAccount.findUnique({
      where: { store_id_provider: { store_id: storeId, provider } },
    });
    if (!row) return null;
    return {
      mode: row.mode as "test" | "live",
      credentials: this.open(row.credentials),
      http: this.http,
    };
  }

  /** Providers shoppers can choose for this currency. */
  async enabled(
    storeId: string,
    currency: string,
  ): Promise<{ key: OnlineProviderKey; mode: string }[]> {
    const rows = await this.prisma.paymentAccount.findMany({
      where: { store_id: storeId, enabled: true },
      orderBy: { created_at: "asc" },
    });
    return rows
      .filter((r) => {
        const info = providerInfo(r.provider);
        return info && (!info.currencies || info.currencies.includes(currency));
      })
      .map((r) => ({ key: r.provider as OnlineProviderKey, mode: r.mode }));
  }
}
