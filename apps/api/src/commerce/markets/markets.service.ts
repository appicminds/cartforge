import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type Market } from "@cartforge/database";
import {
  convertPrice,
  marketForCountry,
  ROUNDING_RULES,
  type MarketPricing,
  type RoundingRule,
} from "@cartforge/checkout-engine";
import {
  MARKET_ERROR_CODES,
  providerInfo,
  type MarketsOverview,
  type MarketView,
  type ProductMarketsView,
  type StorefrontMarket,
} from "@cartforge/types";
import type { MarketData, ProductMarketsInput } from "@cartforge/validation";
import { AuditService } from "../../audit/audit.service";
import { AppException } from "../../common/app-exception";
import { PrismaService } from "../../prisma/prisma.service";
import { FxService } from "./fx.service";

type Client = Prisma.TransactionClient | PrismaService;

/** A market ready to price with: the stored row, or the store itself when it has none yet. */
export interface ResolvedMarket {
  /** null = the store's own currency before any market was set up. */
  id: string | null;
  name: string;
  currency: string;
  countries: string[];
  is_primary: boolean;
  pricing: MarketPricing;
  /** Store-currency units per 1 market unit (recorded on orders). */
  store_per_unit: number;
  /** Allowed payment method keys; empty = all that take the currency. */
  payment_methods: string[];
}

export interface PricedVariant {
  price_minor: number | null;
  compare_at_minor: number | null;
}

const OFFLINE_METHODS = ["bank_transfer", "wallet_transfer", "cod"];
/** Methods that move Pakistani rupees only. */
const PKR_ONLY = new Set(["wallet_transfer", "jazzcash", "easypaisa", "safepay"]);

const notFound = () =>
  new AppException(MARKET_ERROR_CODES.MARKET_NOT_FOUND, "Market not found.", HttpStatus.NOT_FOUND);

/**
 * Markets: which countries buy in which currency, at what prices, and with which
 * payment methods. Every store has a primary market in its own currency (created
 * when the merchant first opens Markets; until then the store behaves as before).
 */
@Injectable()
export class MarketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fx: FxService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── Resolving ─────────────

  private async storeCurrency(storeId: string, client: Client = this.prisma) {
    const s = await client.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { currency: true, name: true },
    });
    return s.currency.trim();
  }

  private virtualPrimary(currency: string): ResolvedMarket {
    return {
      id: null,
      name: "Primary market",
      currency,
      countries: [],
      is_primary: true,
      pricing: {
        store_currency: currency,
        currency,
        rate: 1,
        adjustment_bps: 0,
        rounding: "none",
      },
      store_per_unit: 1,
      payment_methods: [],
    };
  }

  /** The rate in use for a market row (store units per 1 market unit), or null. */
  private async rateOf(m: Market, storeCurrency: string) {
    if (m.is_primary || m.currency === storeCurrency)
      return { store_per_unit: 1, source: "store" as const, at: null };
    if (m.pricing_mode === "live") {
      const live = await this.fx.rate(storeCurrency, m.currency);
      return live
        ? { store_per_unit: 1 / live.rate, source: "live" as const, at: live.fetched_at }
        : null;
    }
    return m.manual_rate
      ? { store_per_unit: Number(m.manual_rate), source: "manual" as const, at: null }
      : null;
  }

  private async toResolved(m: Market, storeCurrency: string): Promise<ResolvedMarket | null> {
    const r = await this.rateOf(m, storeCurrency);
    if (!r) return null;
    return {
      id: m.id,
      name: m.name,
      currency: m.currency,
      countries: m.countries,
      is_primary: m.is_primary,
      pricing: {
        store_currency: storeCurrency,
        currency: m.currency,
        rate: 1 / r.store_per_unit,
        adjustment_bps: m.is_primary ? 0 : m.adjustment_bps,
        rounding: m.is_primary ? "none" : (m.rounding as RoundingRule),
      },
      store_per_unit: r.store_per_unit,
      payment_methods: m.payment_methods,
    };
  }

  /** Active markets a shopper can be in (markets without a usable rate are skipped). */
  async activeMarkets(storeId: string, client: Client = this.prisma): Promise<ResolvedMarket[]> {
    const currency = await this.storeCurrency(storeId, client);
    const rows = await client.market.findMany({
      where: { store_id: storeId, OR: [{ active: true }, { is_primary: true }] },
      orderBy: [{ is_primary: "desc" }, { name: "asc" }],
    });
    const out: ResolvedMarket[] = [];
    for (const m of rows) {
      const r = await this.toResolved(m, currency);
      if (r) out.push(r);
    }
    if (!out.some((m) => m.is_primary)) out.unshift(this.virtualPrimary(currency));
    return out;
  }

  /** The market for this request: by id, else by country, else the primary one. */
  async resolve(
    storeId: string,
    marketId?: string | null,
    country?: string | null,
    client: Client = this.prisma,
  ): Promise<ResolvedMarket> {
    const markets = await this.activeMarkets(storeId, client);
    const byId = marketId ? markets.find((m) => m.id === marketId) : undefined;
    if (byId) return byId;
    const withActive = markets.map((m) => ({ ...m, id: m.id ?? "", active: true }));
    const hit = marketForCountry(withActive, country);
    return markets.find((m) => (m.id ?? "") === hit?.id) ?? markets[0]!;
  }

  async storefrontList(storeId: string): Promise<StorefrontMarket[]> {
    return (await this.activeMarkets(storeId)).map((m) => ({
      id: m.id ?? "primary",
      name: m.name,
      currency: m.currency,
      countries: m.countries,
      is_primary: m.is_primary,
    }));
  }

  /**
   * Prices for variants in a market: a fixed price if the merchant set one,
   * otherwise the store price converted.
   */
  async priceVariants(
    market: ResolvedMarket,
    variants: { id: string; price_minor: number | null; compare_at_minor: number | null }[],
    client: Client = this.prisma,
  ): Promise<Map<string, PricedVariant>> {
    const out = new Map<string, PricedVariant>();
    const fixed =
      market.id && !market.is_primary && variants.length
        ? await client.marketPrice.findMany({
            where: { market_id: market.id, variant_id: { in: variants.map((v) => v.id) } },
          })
        : [];
    const byVariant = new Map(fixed.map((f) => [f.variant_id, f]));
    for (const v of variants) {
      const f = byVariant.get(v.id);
      if (f) {
        out.set(v.id, {
          price_minor: Number(f.price_minor),
          compare_at_minor: f.compare_at_minor === null ? null : Number(f.compare_at_minor),
        });
        continue;
      }
      out.set(v.id, {
        price_minor: v.price_minor === null ? null : convertPrice(v.price_minor, market.pricing),
        compare_at_minor:
          v.compare_at_minor === null ? null : convertPrice(v.compare_at_minor, market.pricing),
      });
    }
    return out;
  }

  /** Whether a payment method key may be offered in this market. */
  allowsPayment(market: ResolvedMarket, key: string): boolean {
    if (PKR_ONLY.has(key) && market.currency !== "PKR") return false;
    return market.payment_methods.length === 0 || market.payment_methods.includes(key);
  }

  // ───────────── Admin ─────────────

  /** Creates the primary market from the store's settings the first time. */
  private async ensurePrimary(storeId: string): Promise<void> {
    const exists = await this.prisma.market.findFirst({
      where: { store_id: storeId, is_primary: true },
      select: { id: true },
    });
    if (exists) return;
    const currency = await this.storeCurrency(storeId);
    try {
      await this.prisma.market.create({
        data: {
          store_id: storeId,
          name: currency === "PKR" ? "Pakistan" : "Primary market",
          currency,
          countries: currency === "PKR" ? ["PK"] : [],
          is_primary: true,
        },
      });
    } catch (err) {
      // Two admins opening Markets at once: the other request created it.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
  }

  async overview(storeId: string): Promise<MarketsOverview> {
    await this.ensurePrimary(storeId);
    const currency = await this.storeCurrency(storeId);
    const rows = await this.prisma.market.findMany({
      where: { store_id: storeId },
      orderBy: [{ is_primary: "desc" }, { name: "asc" }],
    });
    // A typical product price for the "how prices look" example.
    const sample = await this.prisma.productVariant.findFirst({
      where: { store_id: storeId, deleted_at: null, price_minor: { not: null } },
      orderBy: { created_at: "asc" },
      select: { price_minor: true },
    });
    const markets: MarketView[] = [];
    for (const m of rows) markets.push(await this.view(m, currency, sample?.price_minor ?? null));
    return { store_currency: currency, live_rates_available: this.fx.available, markets };
  }

  private async view(m: Market, storeCurrency: string, sample: bigint | null): Promise<MarketView> {
    const r = await this.rateOf(m, storeCurrency);
    const resolved = await this.toResolved(m, storeCurrency);
    return {
      id: m.id,
      name: m.name,
      currency: m.currency,
      countries: m.countries,
      is_primary: m.is_primary,
      active: m.active || m.is_primary,
      pricing_mode: m.pricing_mode as "manual" | "live",
      manual_rate: m.manual_rate === null ? null : Number(m.manual_rate),
      rate: r ? r.store_per_unit : null,
      rate_source: r ? r.source : "unavailable",
      rate_updated_at: r?.at ? r.at.toISOString() : null,
      adjustment_bps: m.adjustment_bps,
      rounding: m.rounding as RoundingRule,
      payment_methods: m.payment_methods,
      example:
        sample !== null && resolved
          ? {
              store_minor: Number(sample),
              market_minor: convertPrice(Number(sample), resolved.pricing),
            }
          : null,
    };
  }

  private async check(
    storeId: string,
    input: MarketData,
    self: Market | null,
    storeCurrency: string,
  ) {
    const fields: { path: string; message: string; code: string }[] = [];
    const primary = self?.is_primary ?? false;
    if (primary && input.currency !== storeCurrency)
      fields.push({
        path: "currency",
        message: `The primary market sells in the store currency (${storeCurrency}).`,
        code: "locked",
      });
    if (!primary && input.countries.length === 0)
      fields.push({ path: "countries", message: "Add at least one country", code: "required" });
    if (!primary && input.currency !== storeCurrency) {
      if (input.pricing_mode === "manual" && !input.manual_rate)
        fields.push({
          path: "manual_rate",
          message: `Enter how many ${storeCurrency} one ${input.currency} is worth`,
          code: "required",
        });
      if (input.pricing_mode === "live" && !this.fx.available)
        fields.push({
          path: "pricing_mode",
          message: "Live rates aren't set up on this server yet. Use your own rate for now.",
          code: "unavailable",
        });
    }
    try {
      new Intl.NumberFormat("en", { style: "currency", currency: input.currency });
      if (!Intl.supportedValuesOf("currency").includes(input.currency)) throw new Error();
    } catch {
      fields.push({ path: "currency", message: "Unknown currency", code: "invalid" });
    }
    if (!ROUNDING_RULES.includes(input.rounding))
      fields.push({ path: "rounding", message: "Choose a rounding rule", code: "invalid" });
    for (const key of input.payment_methods) {
      const known = OFFLINE_METHODS.includes(key) || !!providerInfo(key);
      if (!known)
        fields.push({ path: "payment_methods", message: `Unknown method ${key}`, code: "invalid" });
      else if (PKR_ONLY.has(key) && input.currency !== "PKR")
        fields.push({
          path: "payment_methods",
          message: `${providerInfo(key)?.name ?? "JazzCash, Easypaisa or Raast transfer"} takes PKR only`,
          code: "currency",
        });
    }
    // A country belongs to one market.
    const others = await this.prisma.market.findMany({
      where: { store_id: storeId, ...(self ? { id: { not: self.id } } : {}) },
      select: { name: true, countries: true },
    });
    for (const c of input.countries) {
      const owner = others.find((o) => o.countries.includes(c));
      if (owner) {
        fields.push({
          path: "countries",
          message: `${c} is already in ${owner.name}`,
          code: MARKET_ERROR_CODES.MARKET_COUNTRY_TAKEN,
        });
        break;
      }
    }
    if (fields.length) throw AppException.validation(fields);
  }

  private data(input: MarketData, primary: boolean) {
    return {
      name: input.name,
      currency: input.currency,
      countries: input.countries,
      active: primary ? true : input.active,
      pricing_mode: primary ? "manual" : input.pricing_mode,
      manual_rate: primary ? null : input.manual_rate,
      adjustment_bps: primary ? 0 : input.adjustment_bps,
      rounding: primary ? "none" : input.rounding,
      payment_methods: input.payment_methods,
    };
  }

  async create(storeId: string, input: MarketData, actor: { user_id: string; request_id: string }) {
    await this.ensurePrimary(storeId);
    const currency = await this.storeCurrency(storeId);
    await this.check(storeId, input, null, currency);
    const m = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.market.create({
          data: { ...this.data(input, false), store_id: storeId },
        });
        await this.audit.recordIn(tx, {
          action: "market.created",
          resource_type: "market",
          resource_id: created.id,
          store_id: storeId,
          actor_user_id: actor.user_id,
          request_id: actor.request_id,
          metadata: { name: created.name, currency: created.currency },
        });
        return created;
      })
      .catch(this.nameTaken);
    return this.view(m, currency, null);
  }

  async update(
    storeId: string,
    id: string,
    input: MarketData,
    actor: { user_id: string; request_id: string },
  ) {
    const self = await this.prisma.market.findFirst({ where: { id, store_id: storeId } });
    if (!self) throw notFound();
    const currency = await this.storeCurrency(storeId);
    await this.check(storeId, input, self, currency);
    const m = await this.prisma
      .$transaction(async (tx) => {
        const updated = await tx.market.update({
          where: { id },
          data: this.data(input, self.is_primary),
        });
        await this.audit.recordIn(tx, {
          action: "market.updated",
          resource_type: "market",
          resource_id: id,
          store_id: storeId,
          actor_user_id: actor.user_id,
          request_id: actor.request_id,
          metadata: { name: updated.name, currency: updated.currency },
        });
        return updated;
      })
      .catch(this.nameTaken);
    return this.view(m, currency, null);
  }

  private nameTaken = (err: unknown): never => {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
      throw AppException.validation([
        { path: "name", message: "Another market has this name", code: "taken" },
      ]);
    throw err;
  };

  async remove(storeId: string, id: string, actor: { user_id: string; request_id: string }) {
    const self = await this.prisma.market.findFirst({ where: { id, store_id: storeId } });
    if (!self) throw notFound();
    if (self.is_primary)
      throw new AppException(
        MARKET_ERROR_CODES.PRIMARY_MARKET_LOCKED,
        "The primary market can't be deleted.",
        HttpStatus.CONFLICT,
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.market.delete({ where: { id } });
      // Products hidden from it don't need to remember it.
      await tx.$executeRaw`
        UPDATE products SET hidden_market_ids = array_remove(hidden_market_ids, ${id}::uuid)
        WHERE store_id = ${storeId}::uuid AND ${id}::uuid = ANY(hidden_market_ids)`;
      await this.audit.recordIn(tx, {
        action: "market.deleted",
        resource_type: "market",
        resource_id: id,
        store_id: storeId,
        actor_user_id: actor.user_id,
        request_id: actor.request_id,
        metadata: { name: self.name },
      });
    });
  }

  // ───────────── Per product ─────────────

  async productMarkets(storeId: string, productId: string): Promise<ProductMarketsView> {
    await this.ensurePrimary(storeId);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, store_id: storeId, deleted_at: null },
      select: {
        hidden_market_ids: true,
        variants: {
          where: { deleted_at: null },
          orderBy: { position: "asc" },
          select: { id: true, title: true, price_minor: true, compare_at_minor: true },
        },
      },
    });
    if (!product) throw AppException.notFound("Product");
    const currency = await this.storeCurrency(storeId);
    const rows = await this.prisma.market.findMany({
      where: { store_id: storeId },
      orderBy: [{ is_primary: "desc" }, { name: "asc" }],
    });
    const fixed = await this.prisma.marketPrice.findMany({
      where: { variant_id: { in: product.variants.map((v) => v.id) } },
    });
    const markets: ProductMarketsView["markets"] = [];
    for (const m of rows) {
      const r = await this.toResolved(m, currency);
      markets.push({
        id: m.id,
        name: m.name,
        currency: m.currency,
        is_primary: m.is_primary,
        rows: m.is_primary
          ? []
          : product.variants.map((v) => {
              const f = fixed.find((x) => x.market_id === m.id && x.variant_id === v.id);
              return {
                variant_id: v.id,
                variant_title: v.title,
                converted_minor:
                  r && v.price_minor !== null
                    ? convertPrice(Number(v.price_minor), r.pricing)
                    : null,
                price_minor: f ? Number(f.price_minor) : null,
                compare_at_minor: f?.compare_at_minor != null ? Number(f.compare_at_minor) : null,
              };
            }),
      });
    }
    return { hidden_market_ids: product.hidden_market_ids, markets };
  }

  async saveProductMarkets(
    storeId: string,
    productId: string,
    input: Required<ProductMarketsInput>,
    actor: { user_id: string; request_id: string },
  ): Promise<ProductMarketsView> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, store_id: storeId, deleted_at: null },
      select: { id: true, variants: { where: { deleted_at: null }, select: { id: true } } },
    });
    if (!product) throw AppException.notFound("Product");
    const markets = await this.prisma.market.findMany({
      where: { store_id: storeId },
      select: { id: true, is_primary: true },
    });
    const marketIds = new Set(markets.map((m) => m.id));
    const primaryId = markets.find((m) => m.is_primary)?.id;
    const variantIds = new Set(product.variants.map((v) => v.id));
    const fields: { path: string; message: string; code: string }[] = [];
    for (const id of input.hidden_market_ids)
      if (!marketIds.has(id) || id === primaryId)
        fields.push({
          path: "hidden_market_ids",
          message: "A product can't be hidden from its primary market",
          code: "invalid",
        });
    input.prices.forEach((p, i) => {
      if (!marketIds.has(p.market_id) || p.market_id === primaryId || !variantIds.has(p.variant_id))
        fields.push({ path: `prices.${i}`, message: "Unknown market or variant", code: "invalid" });
    });
    if (fields.length) throw AppException.validation(fields.slice(0, 1));

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: { hidden_market_ids: [...new Set(input.hidden_market_ids)] },
      });
      for (const p of input.prices) {
        const key = { market_id_variant_id: { market_id: p.market_id, variant_id: p.variant_id } };
        if (p.price_minor === null)
          await tx.marketPrice.deleteMany({ where: key.market_id_variant_id });
        else
          await tx.marketPrice.upsert({
            where: key,
            create: {
              market_id: p.market_id,
              variant_id: p.variant_id,
              price_minor: BigInt(p.price_minor),
              compare_at_minor:
                p.compare_at_minor === null ? null : BigInt(p.compare_at_minor ?? 0),
            },
            update: {
              price_minor: BigInt(p.price_minor),
              compare_at_minor:
                p.compare_at_minor === null ? null : BigInt(p.compare_at_minor ?? 0),
            },
          });
      }
      await this.audit.recordIn(tx, {
        action: "product.markets_updated",
        resource_type: "product",
        resource_id: productId,
        store_id: storeId,
        actor_user_id: actor.user_id,
        request_id: actor.request_id,
        metadata: { hidden: input.hidden_market_ids.length, prices: input.prices.length },
      });
    });
    return this.productMarkets(storeId, productId);
  }
}
