import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Prisma, type Sale } from "@cartforge/database";
import { salePrice, type SaleRule } from "@cartforge/checkout-engine";
import {
  SALE_ERROR_CODES,
  type ProductSaleInfo,
  type SaleDetail,
  type SaleEndResult,
  type SalePreview,
  type SalePreviewRow,
  type SaleSkipReason,
  type SaleStatus,
  type SaleTarget,
  type SaleView,
} from "@cartforge/types";
import {
  formatMoney,
  saleRunningUpdateSchema,
  saleSchema,
  type SaleData,
} from "@cartforge/validation";
import { AuditService } from "../../audit/audit.service";
import { AppException } from "../../common/app-exception";
import { zodIssuesToFields } from "../../common/zod-validation.pipe";
import { PrismaService } from "../../prisma/prisma.service";
import { CATALOG_TAG, StorefrontRevalidator } from "../../storefront/revalidation";

type Tx = Prisma.TransactionClient;
type Actor = { user_id: string; request_id: string } | null;

const notFound = () =>
  new AppException(SALE_ERROR_CODES.SALE_NOT_FOUND, "Sale not found.", HttpStatus.NOT_FOUND);

const asTarget = (v: unknown): SaleTarget => {
  const t = (v ?? {}) as Partial<SaleTarget>;
  return {
    all: !!t.all,
    product_ids: Array.isArray(t.product_ids) ? t.product_ids : [],
    collection_ids: Array.isArray(t.collection_ids) ? t.collection_ids : [],
  };
};

interface Candidate {
  variant_id: string;
  product_id: string;
  product_title: string;
  variant_title: string;
  price: number | null;
  compare: number | null;
  in_other_sale: boolean;
}

type Change = Candidate & { sale_price: number; sale_compare: number };

/** Runs scheduled starts and ends at most this often per store as pages are visited. */
const CATCH_UP_MS = 30_000;
const CHUNK = 500;

/**
 * Sales: bulk price changes (e.g. 20% off everything) written to the variants,
 * with each variant's old prices kept so ending the sale puts them back. A
 * variant edited by hand during the sale keeps its new price when it ends.
 */
@Injectable()
export class SalesService {
  private readonly log = new Logger(SalesService.name);
  private readonly lastCatchUp = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidator: StorefrontRevalidator,
  ) {}

  private async currency(storeId: string) {
    return (
      await this.prisma.store.findUniqueOrThrow({
        where: { id: storeId },
        select: { currency: true },
      })
    ).currency.trim();
  }

  private summary(s: Pick<Sale, "value_type" | "value" | "target">, currency: string) {
    const value =
      s.value_type === "percent"
        ? `${Number(s.value) / 100}%`
        : formatMoney(Number(s.value), currency);
    const t = asTarget(s.target);
    const n = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;
    const what = t.all
      ? "all products"
      : [
          t.product_ids.length ? n(t.product_ids.length, "product") : "",
          t.collection_ids.length ? n(t.collection_ids.length, "collection") : "",
        ]
          .filter(Boolean)
          .join(" and ");
    return `${value} off ${what}`;
  }

  private rule(s: Pick<Sale, "value_type" | "value" | "existing" | "rounding">, currency: string) {
    return {
      value_type: s.value_type as SaleRule["value_type"],
      value: Number(s.value),
      existing: s.existing as SaleRule["existing"],
      rounding: s.rounding as SaleRule["rounding"],
      currency,
    };
  }

  private async counts(saleIds: string[]) {
    const out = new Map<string, Record<string, { n: number; p: number }>>();
    if (!saleIds.length) return out;
    const rows = await this.prisma.$queryRaw<
      { sale_id: string; status: string; n: bigint; p: bigint }[]
    >`SELECT sale_id, status, count(*) AS n, count(DISTINCT product_id) AS p
      FROM sale_items WHERE sale_id = ANY(${saleIds}::uuid[]) GROUP BY sale_id, status`;
    for (const r of rows) {
      const m = out.get(r.sale_id) ?? {};
      m[r.status] = { n: Number(r.n), p: Number(r.p) };
      out.set(r.sale_id, m);
    }
    return out;
  }

  private view(
    s: Sale,
    currency: string,
    counts: Record<string, { n: number; p: number }> = {},
  ): SaleView {
    const c = (k: string) => counts[k] ?? { n: 0, p: 0 };
    const all = ["active", "restored", "kept", "removed"].map(c);
    return {
      id: s.id,
      title: s.title,
      value_type: s.value_type as "percent" | "fixed",
      value: Number(s.value),
      target: asTarget(s.target),
      existing: s.existing as SaleView["existing"],
      rounding: s.rounding as SaleView["rounding"],
      starts_at: s.starts_at.toISOString(),
      ends_at: s.ends_at?.toISOString() ?? null,
      status: s.status as SaleStatus,
      started_at: s.started_at?.toISOString() ?? null,
      ended_at: s.ended_at?.toISOString() ?? null,
      summary: this.summary(s, currency),
      product_count: s.status === "running" ? c("active").p : Math.max(...all.map((x) => x.p)),
      variant_count: s.status === "running" ? c("active").n : all.reduce((a, x) => a + x.n, 0),
      restored_count: c("restored").n,
      kept_count: c("kept").n,
      created_at: s.created_at.toISOString(),
    };
  }

  // ───────────── Which variants, at what price ─────────────

  private async candidates(
    tx: Tx | PrismaService,
    storeId: string,
    target: SaleTarget,
    saleId: string | null,
  ): Promise<Candidate[]> {
    const products = await tx.product.findMany({
      where: {
        store_id: storeId,
        deleted_at: null,
        ...(target.all
          ? {}
          : {
              OR: [
                { id: { in: target.product_ids } },
                { collections: { some: { collection_id: { in: target.collection_ids } } } },
              ],
            }),
      },
      select: {
        id: true,
        title: true,
        variants: {
          where: { deleted_at: null },
          orderBy: { position: "asc" },
          select: { id: true, title: true, price_minor: true, compare_at_minor: true },
        },
      },
      orderBy: { title: "asc" },
    });
    const ids = products.flatMap((p) => p.variants.map((v) => v.id));
    const taken = new Set(
      (
        await tx.saleItem.findMany({
          where: {
            variant_id: { in: ids },
            status: "active",
            ...(saleId ? { sale_id: { not: saleId } } : {}),
          },
          select: { variant_id: true },
        })
      ).map((r) => r.variant_id),
    );
    return products.flatMap((p) =>
      p.variants.map((v) => ({
        variant_id: v.id,
        product_id: p.id,
        product_title: p.title,
        variant_title: v.title,
        price: v.price_minor === null ? null : Number(v.price_minor),
        compare: v.compare_at_minor === null ? null : Number(v.compare_at_minor),
        in_other_sale: taken.has(v.id),
      })),
    );
  }

  private price(c: Candidate, rule: SaleRule) {
    if (c.in_other_sale)
      return { ok: false as const, reason: "in_other_sale" as SaleSkipReason, before: false };
    const r = salePrice({ price_minor: c.price, compare_at_minor: c.compare }, rule);
    return r.ok
      ? { ...r, before: r.discounted_before }
      : { ok: false as const, reason: r.reason as SaleSkipReason, before: r.discounted_before };
  }

  async preview(storeId: string, input: SaleData): Promise<SalePreview> {
    const currency = await this.currency(storeId);
    const rule = this.rule({ ...input, value: BigInt(input.value) }, currency);
    const cands = await this.candidates(this.prisma, storeId, input.target, null);
    const skipped = new Map<SaleSkipReason, number>();
    const changes: SalePreviewRow[] = [];
    const skips: SalePreviewRow[] = [];
    const changingProducts = new Set<string>();
    let before = 0;
    for (const c of cands) {
      const r = this.price(c, rule);
      if (r.before) before++;
      const row = {
        product_id: c.product_id,
        product_title: c.product_title,
        variant_title: c.variant_title,
        price_minor: c.price,
        compare_at_minor: c.compare,
        sale_price_minor: r.ok ? r.price_minor : null,
        sale_compare_minor: r.ok ? r.compare_at_minor : null,
        skip: r.ok ? null : r.reason,
      };
      if (r.ok) {
        changingProducts.add(c.product_id);
        changes.push(row);
      } else {
        skipped.set(r.reason, (skipped.get(r.reason) ?? 0) + 1);
        skips.push(row);
      }
    }
    return {
      currency,
      matched: cands.length,
      changing: changes.length,
      changing_products: changingProducts.size,
      already_discounted: before,
      skipped: [...skipped].map(([reason, count]) => ({ reason, count })),
      samples: [...changes.slice(0, 8), ...skips.slice(0, 12 - Math.min(8, changes.length))],
    };
  }

  // ───────────── Writing prices ─────────────

  /**
   * Sets prices only where the variant still has the expected prices; returns
   * the variants that changed. One statement per chunk, so large sales are fast.
   */
  private async writePrices(
    tx: Tx,
    rows: {
      id: string;
      price: number;
      compare: number | null;
      was: number;
      wasCompare: number | null;
    }[],
  ): Promise<Set<string>> {
    const done = new Set<string>();
    for (let i = 0; i < rows.length; i += CHUNK) {
      const values = Prisma.join(
        rows
          .slice(i, i + CHUNK)
          .map(
            (r) =>
              Prisma.sql`(${r.id}::uuid, ${r.price}::bigint, ${r.compare}::bigint, ${r.was}::bigint, ${r.wasCompare}::bigint)`,
          ),
      );
      const out = await tx.$queryRaw<{ id: string }[]>`
        UPDATE product_variants AS v
        SET price_minor = x.p, compare_at_minor = x.c, updated_at = now()
        FROM (VALUES ${values}) AS x(id, p, c, op, oc)
        WHERE v.id = x.id AND v.deleted_at IS NULL
          AND v.price_minor = x.op AND v.compare_at_minor IS NOT DISTINCT FROM x.oc
        RETURNING v.id`;
      for (const r of out) done.add(r.id);
    }
    return done;
  }

  /** Locks the sale row; null when it's gone or no longer in one of `statuses`. */
  private async lock(tx: Tx, id: string, statuses: SaleStatus[]): Promise<Sale | null> {
    await tx.$queryRaw`SELECT id FROM sales WHERE id = ${id}::uuid FOR UPDATE`;
    const s = await tx.sale.findUnique({ where: { id } });
    return s && statuses.includes(s.status as SaleStatus) ? s : null;
  }

  /** Puts sale prices on matching variants not already in this sale. */
  private async applyTo(tx: Tx, s: Sale, currency: string): Promise<number> {
    const rule = this.rule(s, currency);
    const already = new Set(
      (await tx.saleItem.findMany({ where: { sale_id: s.id }, select: { variant_id: true } })).map(
        (r) => r.variant_id,
      ),
    );
    const changes: Change[] = [];
    for (const c of await this.candidates(tx, s.store_id, asTarget(s.target), s.id)) {
      if (already.has(c.variant_id)) continue;
      const r = this.price(c, rule);
      if (r.ok) changes.push({ ...c, sale_price: r.price_minor, sale_compare: r.compare_at_minor });
    }
    const done = await this.writePrices(
      tx,
      changes.map((c) => ({
        id: c.variant_id,
        price: c.sale_price,
        compare: c.sale_compare,
        was: c.price!,
        wasCompare: c.compare,
      })),
    );
    const applied = changes.filter((c) => done.has(c.variant_id));
    if (applied.length)
      await tx.saleItem.createMany({
        data: applied.map((c) => ({
          sale_id: s.id,
          store_id: s.store_id,
          product_id: c.product_id,
          variant_id: c.variant_id,
          old_price_minor: BigInt(c.price!),
          old_compare_minor: c.compare === null ? null : BigInt(c.compare),
          sale_price_minor: BigInt(c.sale_price),
          sale_compare_minor: BigInt(c.sale_compare),
        })),
      });
    return applied.length;
  }

  /** Puts the old prices back on these sale items (unless edited during the sale). */
  private async restore(
    tx: Tx,
    items: {
      id: string;
      variant_id: string;
      old_price_minor: bigint;
      old_compare_minor: bigint | null;
      sale_price_minor: bigint;
      sale_compare_minor: bigint;
    }[],
  ): Promise<SaleEndResult> {
    const done = await this.writePrices(
      tx,
      items.map((i) => ({
        id: i.variant_id,
        price: Number(i.old_price_minor),
        compare: i.old_compare_minor === null ? null : Number(i.old_compare_minor),
        was: Number(i.sale_price_minor),
        wasCompare: Number(i.sale_compare_minor),
      })),
    );
    const rest = items.filter((i) => !done.has(i.variant_id));
    const live = await tx.productVariant.findMany({
      where: { id: { in: rest.map((i) => i.variant_id) }, deleted_at: null },
      select: { id: true, title: true, product: { select: { title: true, deleted_at: true } } },
    });
    const liveById = new Map(live.filter((v) => !v.product.deleted_at).map((v) => [v.id, v]));
    const now = new Date();
    const mark = (ids: string[], status: string) =>
      ids.length
        ? tx.saleItem.updateMany({ where: { id: { in: ids } }, data: { status, ended_at: now } })
        : null;
    await mark(
      items.filter((i) => done.has(i.variant_id)).map((i) => i.id),
      "restored",
    );
    await mark(
      rest.filter((i) => liveById.has(i.variant_id)).map((i) => i.id),
      "kept",
    );
    await mark(
      rest.filter((i) => !liveById.has(i.variant_id)).map((i) => i.id),
      "removed",
    );
    return {
      restored: done.size,
      kept: rest
        .filter((i) => liveById.has(i.variant_id))
        .map((i) => {
          const v = liveById.get(i.variant_id)!;
          return { product_title: v.product.title, variant_title: v.title };
        }),
    };
  }

  private auditIn(tx: Tx, s: Sale, action: string, actor: Actor, metadata: object) {
    return this.audit.recordIn(tx, {
      action,
      resource_type: "sale",
      resource_id: s.id,
      store_id: s.store_id,
      actor_user_id: actor?.user_id ?? null,
      request_id: actor?.request_id,
      metadata: { title: s.title, ...metadata },
    });
  }

  private async start(tx: Tx, s: Sale, currency: string, actor: Actor): Promise<number> {
    const n = await this.applyTo(tx, s, currency);
    await tx.sale.update({
      where: { id: s.id },
      data: { status: "running", started_at: new Date() },
    });
    await this.auditIn(tx, s, "sale.started", actor, { variants: n });
    return n;
  }

  private async finish(tx: Tx, s: Sale, actor: Actor): Promise<SaleEndResult> {
    const items = await tx.saleItem.findMany({ where: { sale_id: s.id, status: "active" } });
    const result = await this.restore(tx, items);
    await tx.sale.update({ where: { id: s.id }, data: { status: "ended", ended_at: new Date() } });
    await this.auditIn(tx, s, "sale.ended", actor, {
      restored: result.restored,
      kept: result.kept.length,
      automatic: actor === null,
    });
    return result;
  }

  private refresh(storeId: string) {
    return this.revalidator.enabled
      ? this.revalidator.notify([`${CATALOG_TAG}:${storeId.toLowerCase()}`])
      : Promise.resolve();
  }

  // ───────────── Admin ─────────────

  async list(storeId: string): Promise<SaleView[]> {
    await this.catchUp(storeId, true);
    const rows = await this.prisma.sale.findMany({
      where: { store_id: storeId },
      orderBy: { created_at: "desc" },
    });
    const [currency, counts] = await Promise.all([
      this.currency(storeId),
      this.counts(rows.map((r) => r.id)),
    ]);
    return rows.map((r) => this.view(r, currency, counts.get(r.id)));
  }

  async get(storeId: string, id: string): Promise<SaleDetail> {
    await this.catchUp(storeId, true);
    const s = await this.prisma.sale.findFirst({ where: { id, store_id: storeId } });
    if (!s) throw notFound();
    const [currency, counts, items] = await Promise.all([
      this.currency(storeId),
      this.counts([id]),
      this.prisma.saleItem.findMany({
        where: { sale_id: id },
        orderBy: { created_at: "asc" },
        take: 1000,
      }),
    ]);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: items.map((i) => i.variant_id) } },
      select: { id: true, title: true, price_minor: true, product: { select: { title: true } } },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));
    const order = { active: 0, kept: 1, restored: 2, removed: 3 } as Record<string, number>;
    return {
      ...this.view(s, currency, counts.get(id)),
      currency,
      items: items
        .map((i) => {
          const v = byId.get(i.variant_id);
          return {
            product_id: i.product_id,
            product_title: v?.product.title ?? "Deleted product",
            variant_title: v?.title ?? "",
            old_price_minor: Number(i.old_price_minor),
            old_compare_minor: i.old_compare_minor === null ? null : Number(i.old_compare_minor),
            sale_price_minor: Number(i.sale_price_minor),
            current_price_minor: v?.price_minor == null ? null : Number(v.price_minor),
            status: i.status as SaleDetail["items"][number]["status"],
          };
        })
        .sort(
          (a, b) =>
            order[a.status]! - order[b.status]! || a.product_title.localeCompare(b.product_title),
        ),
    };
  }

  private noProducts = () =>
    new AppException(
      SALE_ERROR_CODES.SALE_NO_PRODUCTS,
      "No product prices would change. Check the products chosen and how already-discounted products are handled.",
      HttpStatus.UNPROCESSABLE_ENTITY,
    );

  async create(storeId: string, input: SaleData, actor: NonNullable<Actor>): Promise<SaleView> {
    const currency = await this.currency(storeId);
    const now = new Date();
    const startNow = !input.starts_at || input.starts_at <= now;
    const id = await this.prisma.$transaction(
      async (tx) => {
        const s = await tx.sale.create({
          data: {
            store_id: storeId,
            title: input.title,
            value_type: input.value_type,
            value: BigInt(input.value),
            target: input.target as Prisma.InputJsonValue,
            existing: input.existing,
            rounding: input.rounding,
            starts_at: startNow ? now : input.starts_at!,
            ends_at: input.ends_at,
            status: "scheduled",
          },
        });
        await this.auditIn(tx, s, "sale.created", actor, {
          summary: this.summary(s, currency),
          starts_at: s.starts_at,
          ends_at: s.ends_at,
        });
        if (startNow && !(await this.start(tx, s, currency, actor))) throw this.noProducts();
        return s.id;
      },
      { timeout: 25_000 },
    );
    if (startNow) await this.refresh(storeId);
    const s = await this.prisma.sale.findUniqueOrThrow({ where: { id } });
    return this.view(s, currency, (await this.counts([id])).get(id));
  }

  /** Scheduled: any change. Running: name and end date only. Ended: nothing. */
  async update(storeId: string, id: string, body: unknown, actor: NonNullable<Actor>) {
    const s = await this.prisma.sale.findFirst({ where: { id, store_id: storeId } });
    if (!s) throw notFound();
    const currency = await this.currency(storeId);
    let started = false;
    if (s.status === "scheduled") {
      const parsed = saleSchema.safeParse(body);
      if (!parsed.success) throw AppException.validation(zodIssuesToFields(parsed.error.issues));
      const input = parsed.data;
      const now = new Date();
      const startNow = !input.starts_at || input.starts_at <= now;
      await this.prisma.$transaction(
        async (tx) => {
          if (!(await this.lock(tx, id, ["scheduled"]))) throw this.notEditable();
          const next = await tx.sale.update({
            where: { id },
            data: {
              title: input.title,
              value_type: input.value_type,
              value: BigInt(input.value),
              target: input.target as Prisma.InputJsonValue,
              existing: input.existing,
              rounding: input.rounding,
              starts_at: startNow ? now : input.starts_at!,
              ends_at: input.ends_at,
            },
          });
          await this.auditIn(tx, next, "sale.updated", actor, {
            summary: this.summary(next, currency),
          });
          if (startNow) {
            if (!(await this.start(tx, next, currency, actor))) throw this.noProducts();
            started = true;
          }
        },
        { timeout: 25_000 },
      );
    } else if (s.status === "running") {
      const parsed = saleRunningUpdateSchema.safeParse(body);
      if (!parsed.success) throw AppException.validation(zodIssuesToFields(parsed.error.issues));
      const { title, ends_at } = parsed.data;
      if (ends_at && ends_at <= new Date())
        throw AppException.validation([
          { path: "ends_at", message: "Must be in the future, or end the sale now", code: "past" },
        ]);
      await this.prisma.$transaction(async (tx) => {
        if (!(await this.lock(tx, id, ["running"]))) throw this.notEditable();
        const next = await tx.sale.update({
          where: { id },
          data: { ...(title ? { title } : {}), ...(ends_at !== undefined ? { ends_at } : {}) },
        });
        await this.auditIn(tx, next, "sale.updated", actor, { ends_at: next.ends_at });
      });
    } else throw this.notEditable();
    if (started) await this.refresh(storeId);
    return this.get(storeId, id);
  }

  private notEditable = () =>
    new AppException(
      SALE_ERROR_CODES.SALE_NOT_EDITABLE,
      "This sale has ended and can't be changed.",
      HttpStatus.CONFLICT,
    );

  /** Running: put prices back now. Scheduled: cancel it. */
  async end(storeId: string, id: string, actor: NonNullable<Actor>): Promise<SaleEndResult> {
    const s = await this.prisma.sale.findFirst({ where: { id, store_id: storeId } });
    if (!s) throw notFound();
    const result = await this.prisma.$transaction(
      async (tx) => {
        const locked = await this.lock(tx, id, ["scheduled", "running"]);
        if (!locked) throw this.notEditable();
        if (locked.status === "scheduled") {
          await tx.sale.update({
            where: { id },
            data: { status: "canceled", ended_at: new Date() },
          });
          await this.auditIn(tx, locked, "sale.canceled", actor, {});
          return { restored: 0, kept: [] };
        }
        return this.finish(tx, locked, actor);
      },
      { timeout: 25_000 },
    );
    if (result.restored) await this.refresh(storeId);
    return result;
  }

  /** Takes products out of a running sale (their prices go back now). */
  async removeProducts(
    storeId: string,
    id: string,
    productIds: string[],
    actor: NonNullable<Actor>,
  ): Promise<SaleEndResult> {
    const s = await this.prisma.sale.findFirst({ where: { id, store_id: storeId } });
    if (!s) throw notFound();
    const result = await this.prisma.$transaction(
      async (tx) => {
        const locked = await this.lock(tx, id, ["running"]);
        if (!locked) throw this.notEditable();
        const items = await tx.saleItem.findMany({
          where: { sale_id: id, status: "active", product_id: { in: productIds } },
        });
        const r = await this.restore(tx, items);
        await this.auditIn(tx, locked, "sale.products_removed", actor, {
          products: productIds.length,
          restored: r.restored,
        });
        return r;
      },
      { timeout: 25_000 },
    );
    if (result.restored) await this.refresh(storeId);
    return result;
  }

  /** Adds products that match the sale but aren't in it yet (e.g. added after it started). */
  async applyNew(storeId: string, id: string, actor: NonNullable<Actor>): Promise<number> {
    const s = await this.prisma.sale.findFirst({ where: { id, store_id: storeId } });
    if (!s) throw notFound();
    const currency = await this.currency(storeId);
    const n = await this.prisma.$transaction(
      async (tx) => {
        const locked = await this.lock(tx, id, ["running"]);
        if (!locked) throw this.notEditable();
        const added = await this.applyTo(tx, locked, currency);
        await this.auditIn(tx, locked, "sale.products_added", actor, { variants: added });
        return added;
      },
      { timeout: 25_000 },
    );
    if (n) await this.refresh(storeId);
    return n;
  }

  /** Only sales that aren't running can be deleted (end it first). */
  async remove(storeId: string, id: string, actor: NonNullable<Actor>) {
    await this.prisma.$transaction(async (tx) => {
      const s = await tx.sale.findFirst({ where: { id, store_id: storeId } });
      if (!s) throw notFound();
      if (!(await this.lock(tx, id, ["scheduled", "ended", "canceled"])))
        throw new AppException(
          SALE_ERROR_CODES.SALE_NOT_EDITABLE,
          "End the sale before deleting it.",
          HttpStatus.CONFLICT,
        );
      await tx.sale.delete({ where: { id } });
      await this.auditIn(tx, s, "sale.deleted", actor, {});
    });
  }

  /** The running (or else next scheduled) sale a product is in, for the product page. */
  async forProduct(storeId: string, productId: string): Promise<ProductSaleInfo | null> {
    const currency = await this.currency(storeId);
    const item = await this.prisma.saleItem.findFirst({
      where: { store_id: storeId, product_id: productId, status: "active" },
      include: { sale: true },
    });
    const info = (s: Sale): ProductSaleInfo => ({
      id: s.id,
      title: s.title,
      summary: this.summary(s, currency),
      status: s.status as SaleStatus,
      ends_at: s.ends_at?.toISOString() ?? null,
    });
    if (item) return info(item.sale);
    const scheduled = await this.prisma.sale.findMany({
      where: { store_id: storeId, status: "scheduled" },
      orderBy: { starts_at: "asc" },
    });
    if (!scheduled.length) return null;
    const cols = new Set(
      (
        await this.prisma.collectionProduct.findMany({
          where: { product_id: productId },
          select: { collection_id: true },
        })
      ).map((c) => c.collection_id),
    );
    const s = scheduled.find((x) => {
      const t = asTarget(x.target);
      return (
        t.all || t.product_ids.includes(productId) || t.collection_ids.some((c) => cols.has(c))
      );
    });
    return s ? info(s) : null;
  }

  // ───────────── Schedule ─────────────

  /**
   * Starts and ends sales whose time has come. Runs from the cron endpoint and,
   * throttled, as the admin and storefront are used, so a missed cron run is
   * caught up by the next visitor. Never throws.
   */
  async catchUp(storeId?: string, force = false): Promise<number> {
    const key = storeId ?? "*";
    const now = Date.now();
    if (!force && now - (this.lastCatchUp.get(key) ?? 0) < CATCH_UP_MS) return 0;
    this.lastCatchUp.set(key, now);
    try {
      const at = new Date();
      const due = await this.prisma.sale.findMany({
        where: {
          ...(storeId ? { store_id: storeId } : {}),
          OR: [
            { status: "running", ends_at: { lte: at } },
            { status: "scheduled", starts_at: { lte: at } },
          ],
        },
        // Ends first, so a sale starting as another ends can take over its products.
        orderBy: [{ status: "asc" }, { starts_at: "asc" }],
      });
      const touched = new Set<string>();
      for (const d of due) {
        try {
          const currency = await this.currency(d.store_id);
          await this.prisma.$transaction(
            async (tx) => {
              const s = await this.lock(tx, d.id, ["scheduled", "running"]);
              if (!s) return;
              if (s.status === "running") await this.finish(tx, s, null);
              else if (s.ends_at && s.ends_at <= at) {
                // Its whole window passed without a run: nothing to put back.
                await tx.sale.update({
                  where: { id: s.id },
                  data: { status: "ended", started_at: s.starts_at, ended_at: s.ends_at },
                });
                await this.auditIn(tx, s, "sale.missed", null, {});
              } else await this.start(tx, s, currency, null);
              touched.add(s.store_id);
            },
            { timeout: 25_000 },
          );
        } catch (err) {
          this.log.error(`Sale ${d.id}: ${(err as Error).message}`);
        }
      }
      for (const id of touched) await this.refresh(id);
      return due.length;
    } catch (err) {
      this.log.error(`Sales catch-up failed: ${(err as Error).message}`);
      return 0;
    }
  }
}
