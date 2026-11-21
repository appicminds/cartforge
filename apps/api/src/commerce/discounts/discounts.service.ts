import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type Discount } from "@cartforge/database";
import { convertAmount, type DiscountRule, type DiscountTarget } from "@cartforge/checkout-engine";
import {
  DISCOUNT_ERROR_CODES,
  type AppliedDiscount,
  type DiscountStatus,
  type DiscountView,
} from "@cartforge/types";
import { formatMoney, type DiscountData } from "@cartforge/validation";
import { AuditService } from "../../audit/audit.service";
import { AppException } from "../../common/app-exception";
import { PrismaService } from "../../prisma/prisma.service";
import type { ResolvedMarket } from "../markets/markets.service";

type Client = Prisma.TransactionClient | PrismaService;
type Actor = { user_id: string; request_id: string };

const notFound = () =>
  new AppException(
    DISCOUNT_ERROR_CODES.DISCOUNT_NOT_FOUND,
    "Discount not found.",
    HttpStatus.NOT_FOUND,
  );

const asTarget = (v: unknown): DiscountTarget => {
  const t = (v ?? {}) as Partial<DiscountTarget>;
  return {
    all: !!t.all,
    product_ids: Array.isArray(t.product_ids) ? t.product_ids : [],
    collection_ids: Array.isArray(t.collection_ids) ? t.collection_ids : [],
  };
};

interface BuyJson {
  quantity: number;
  target: DiscountTarget;
  get_quantity: number;
  max_uses: number | null;
}

export function discountStatus(d: Discount, now = new Date()): DiscountStatus {
  if (!d.enabled) return "disabled";
  if (d.usage_limit !== null && d.used_count >= d.usage_limit) return "used_up";
  if (d.starts_at > now) return "scheduled";
  if (d.ends_at && d.ends_at <= now) return "expired";
  return "active";
}

/** "10% off order", "Rs 500 off products", "Buy 2, get 1 free", "Free shipping". */
export function discountSummary(d: Discount, currency: string): string {
  const value =
    d.value_type === "percent"
      ? `${Number(d.value) / 100}%`
      : formatMoney(Number(d.value), currency);
  switch (d.kind) {
    case "order":
      return `${value} off the order`;
    case "products":
      return `${value} off ${asTarget(d.target).all ? "all products" : "selected products"}`;
    case "bxgy": {
      const b = d.buy as unknown as BuyJson;
      const off = d.value_type === "percent" && Number(d.value) >= 10_000 ? "free" : `${value} off`;
      return `Buy ${b?.quantity ?? 1}, get ${b?.get_quantity ?? 1} ${off}`;
    }
    default:
      return "Free shipping";
  }
}

/** Why an entered code can't be used (shown to the shopper). */
export type CodeProblem = { message: string };

/**
 * Discounts (Next 8): merchant CRUD, which discounts a checkout may use, and
 * usage counting when an order is placed.
 */
@Injectable()
export class DiscountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── Admin ─────────────

  private async currency(storeId: string) {
    return (
      await this.prisma.store.findUniqueOrThrow({
        where: { id: storeId },
        select: { currency: true },
      })
    ).currency.trim();
  }

  view(d: Discount, currency: string): DiscountView {
    const buy = d.buy as unknown as BuyJson | null;
    return {
      id: d.id,
      title: d.title,
      method: d.method as "code" | "automatic",
      code: d.code,
      kind: d.kind as DiscountView["kind"],
      value_type: d.value_type as "percent" | "fixed",
      value: Number(d.value),
      target: asTarget(d.target),
      buy: buy
        ? {
            quantity: buy.quantity,
            target: asTarget(buy.target),
            get_quantity: buy.get_quantity,
            max_uses: buy.max_uses ?? null,
          }
        : null,
      min_subtotal_minor: d.min_subtotal_minor === null ? null : Number(d.min_subtotal_minor),
      min_quantity: d.min_quantity,
      starts_at: d.starts_at.toISOString(),
      ends_at: d.ends_at?.toISOString() ?? null,
      usage_limit: d.usage_limit,
      once_per_customer: d.once_per_customer,
      combines: d.combines,
      market_ids: d.market_ids,
      enabled: d.enabled,
      used_count: d.used_count,
      status: discountStatus(d),
      summary: discountSummary(d, currency),
      created_at: d.created_at.toISOString(),
    };
  }

  async list(storeId: string, q: { q?: string; status?: DiscountStatus }) {
    const rows = await this.prisma.discount.findMany({
      where: {
        store_id: storeId,
        ...(q.q
          ? {
              OR: [
                { title: { contains: q.q, mode: "insensitive" } },
                { code: { contains: q.q.toUpperCase() } },
              ],
            }
          : {}),
      },
      orderBy: { created_at: "desc" },
    });
    const currency = await this.currency(storeId);
    return rows
      .map((d) => this.view(d, currency))
      .filter((d) => !q.status || d.status === q.status);
  }

  async get(storeId: string, id: string) {
    const d = await this.prisma.discount.findFirst({ where: { id, store_id: storeId } });
    if (!d) throw notFound();
    return this.view(d, await this.currency(storeId));
  }

  private data(input: DiscountData) {
    return {
      title: input.title,
      method: input.method,
      code: input.method === "code" ? input.code : null,
      kind: input.kind,
      value_type: input.kind === "shipping" ? "percent" : input.value_type,
      value: BigInt(input.kind === "shipping" ? 10_000 : input.value),
      target: (input.kind === "products" || input.kind === "bxgy"
        ? input.target
        : { all: true, product_ids: [], collection_ids: [] }) as Prisma.InputJsonValue,
      buy:
        input.kind === "bxgy" && input.buy ? (input.buy as Prisma.InputJsonValue) : Prisma.DbNull,
      min_subtotal_minor:
        input.min_subtotal_minor === null ? null : BigInt(input.min_subtotal_minor),
      min_quantity: input.min_quantity,
      ...(input.starts_at ? { starts_at: input.starts_at } : {}),
      ends_at: input.ends_at,
      usage_limit: input.usage_limit,
      once_per_customer: input.once_per_customer,
      combines: input.combines,
      market_ids: input.market_ids,
      enabled: input.enabled,
    };
  }

  private codeTaken = (err: unknown): never => {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
      throw AppException.validation([
        {
          path: "code",
          message: "Another discount uses this code",
          code: DISCOUNT_ERROR_CODES.DISCOUNT_CODE_TAKEN,
        },
      ]);
    throw err;
  };

  async create(storeId: string, input: DiscountData, actor: Actor) {
    const d = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.discount.create({
          data: { ...this.data(input), store_id: storeId },
        });
        await this.audit.recordIn(tx, {
          action: "discount.created",
          resource_type: "discount",
          resource_id: created.id,
          store_id: storeId,
          actor_user_id: actor.user_id,
          request_id: actor.request_id,
          metadata: { title: created.title, code: created.code, kind: created.kind },
        });
        return created;
      })
      .catch(this.codeTaken);
    return this.view(d, await this.currency(storeId));
  }

  async update(storeId: string, id: string, input: DiscountData, actor: Actor) {
    const existing = await this.prisma.discount.findFirst({ where: { id, store_id: storeId } });
    if (!existing) throw notFound();
    if (input.usage_limit !== null && input.usage_limit < existing.used_count)
      throw AppException.validation([
        {
          path: "usage_limit",
          message: `Already used ${existing.used_count} times`,
          code: "too_low",
        },
      ]);
    const d = await this.prisma
      .$transaction(async (tx) => {
        const updated = await tx.discount.update({ where: { id }, data: this.data(input) });
        await this.audit.recordIn(tx, {
          action: "discount.updated",
          resource_type: "discount",
          resource_id: id,
          store_id: storeId,
          actor_user_id: actor.user_id,
          request_id: actor.request_id,
          metadata: { title: updated.title, code: updated.code, enabled: updated.enabled },
        });
        return updated;
      })
      .catch(this.codeTaken);
    return this.view(d, await this.currency(storeId));
  }

  async remove(storeId: string, id: string, actor: Actor) {
    const existing = await this.prisma.discount.findFirst({ where: { id, store_id: storeId } });
    if (!existing) throw notFound();
    await this.prisma.$transaction(async (tx) => {
      await tx.discount.delete({ where: { id } });
      await this.audit.recordIn(tx, {
        action: "discount.deleted",
        resource_type: "discount",
        resource_id: id,
        store_id: storeId,
        actor_user_id: actor.user_id,
        request_id: actor.request_id,
        metadata: { title: existing.title, code: existing.code },
      });
    });
  }

  // ───────────── Checkout ─────────────

  /** A discount row as the engine sees it, amounts in the market's currency. */
  private toRule(d: Discount, market: ResolvedMarket): DiscountRule {
    const fx = (v: bigint | number) => convertAmount(Number(v), market.pricing);
    const buy = d.buy as unknown as BuyJson | null;
    return {
      id: d.id,
      title: d.title,
      code: d.code,
      kind: d.kind as DiscountRule["kind"],
      value_type: d.value_type as "percent" | "fixed",
      value: d.value_type === "fixed" ? fx(d.value) : Number(d.value),
      target: asTarget(d.target),
      min_subtotal_minor: d.min_subtotal_minor === null ? null : fx(d.min_subtotal_minor),
      min_quantity: d.min_quantity,
      buy: buy
        ? {
            quantity: buy.quantity,
            target: asTarget(buy.target),
            get_quantity: buy.get_quantity,
            max_uses: buy.max_uses ?? null,
          }
        : undefined,
      combines: d.combines,
    };
  }

  private problem(d: Discount, market: ResolvedMarket, now: Date): string | null {
    const status = discountStatus(d, now);
    if (status === "disabled") return "This code isn't valid.";
    if (status === "scheduled") return "This code isn't active yet.";
    if (status === "expired") return "This code has expired.";
    if (status === "used_up") return "This code has reached its usage limit.";
    if (d.market_ids.length && (!market.id || !d.market_ids.includes(market.id)))
      return "This code can't be used in your country.";
    return null;
  }

  private async usedBy(tx: Client, discountIds: string[], email: string | null) {
    if (!email || !discountIds.length) return new Set<string>();
    const rows = await tx.discountRedemption.findMany({
      where: { discount_id: { in: discountIds }, email: email.toLowerCase() },
      select: { discount_id: true },
    });
    return new Set(rows.map((r) => r.discount_id));
  }

  /**
   * Discounts this checkout may use: live automatic ones plus the entered code.
   * `codeProblem` explains a code that can't be used.
   */
  async forCheckout(
    tx: Client,
    storeId: string,
    market: ResolvedMarket,
    code: string | null,
    email: string | null,
  ): Promise<{ rules: DiscountRule[]; codeProblem: string | null }> {
    const now = new Date();
    const rows = await tx.discount.findMany({
      where: {
        store_id: storeId,
        enabled: true,
        OR: [{ method: "automatic" }, ...(code ? [{ code }] : [])],
      },
    });
    const once = rows.filter((d) => d.once_per_customer).map((d) => d.id);
    const used = await this.usedBy(tx, once, email);
    const rules: DiscountRule[] = [];
    for (const d of rows)
      if (d.method === "automatic" && !this.problem(d, market, now) && !used.has(d.id))
        rules.push(this.toRule(d, market));
    let codeProblem: string | null = null;
    if (code) {
      const d = rows.find((r) => r.code === code);
      if (!d) codeProblem = "This code isn't valid.";
      else if ((codeProblem = this.problem(d, market, now))) {
        // shown as is
      } else if (used.has(d.id)) codeProblem = "You've already used this code.";
      else rules.push(this.toRule(d, market));
    }
    return { rules, codeProblem };
  }

  /** Is this code usable right now (before saving it on a checkout)? */
  async checkCode(
    tx: Client,
    storeId: string,
    market: ResolvedMarket,
    code: string,
    email: string | null,
  ) {
    return (await this.forCheckout(tx, storeId, market, code, email)).codeProblem;
  }

  /**
   * Counts the uses when the order is placed. Rows are locked so two orders
   * can't both take the last use; a limit reached meanwhile fails the order.
   */
  async redeem(
    tx: Prisma.TransactionClient,
    orderId: string,
    email: string,
    applied: AppliedDiscount[],
  ) {
    if (!applied.length) return;
    const ids = applied.map((a) => a.id);
    const rows = await tx.$queryRaw<
      {
        id: string;
        usage_limit: number | null;
        used_count: number;
        once_per_customer: boolean;
        code: string | null;
      }[]
    >`SELECT id, usage_limit, used_count, once_per_customer, code FROM discounts
      WHERE id = ANY(${ids}::uuid[]) FOR UPDATE`;
    const used = await this.usedBy(
      tx,
      rows.filter((r) => r.once_per_customer).map((r) => r.id),
      email,
    );
    for (const r of rows) {
      if ((r.usage_limit !== null && r.used_count >= r.usage_limit) || used.has(r.id))
        throw new AppException(
          DISCOUNT_ERROR_CODES.DISCOUNT_USED_UP,
          r.code
            ? `The code ${r.code} can't be used any more. Remove it to continue.`
            : "A discount just ended. Please review your order.",
          HttpStatus.CONFLICT,
          [{ path: "discount_code", message: "No longer available", code: "used_up" }],
        );
    }
    await tx.discount.updateMany({
      where: { id: { in: ids } },
      data: { used_count: { increment: 1 } },
    });
    await tx.discountRedemption.createMany({
      data: applied.map((a) => ({
        discount_id: a.id,
        order_id: orderId,
        email: email.toLowerCase(),
        amount_minor: BigInt(a.amount_minor),
      })),
    });
  }
}
