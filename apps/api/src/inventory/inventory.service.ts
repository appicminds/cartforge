import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, storeScoped, type StockMovementType } from "@cartforge/database";
import {
  CATALOG_ERROR_CODES,
  type InventoryRow,
  type InventorySnapshot,
  type ListResponse,
  type StockMovementSummary,
  type StockState,
} from "@cartforge/types";
import type { InventoryAdjust, InventoryListQuery, MovementListQuery } from "@cartforge/validation";
import { AppException } from "../common/app-exception";
import { PrismaService } from "../prisma/prisma.service";

type Tx = Prisma.TransactionClient;

export interface InventoryActor {
  store_id: string;
  user_id: string;
  request_id?: string;
}

interface LockedLevel {
  id: string;
  on_hand: number;
  reserved: number;
  low_stock_threshold: number | null;
}

export function stockState(
  tracked: boolean,
  available: number,
  threshold: number | null,
): StockState {
  if (!tracked) return "untracked";
  if (available <= 0) return "out";
  if (threshold !== null && available <= threshold) return "low";
  return "in_stock";
}

export function snapshot(
  tracked: boolean,
  level:
    | { location_id: string; on_hand: number; reserved: number; low_stock_threshold: number | null }
    | undefined,
  fallbackLocationId: string,
): InventorySnapshot {
  const on_hand = level?.on_hand ?? 0;
  const reserved = level?.reserved ?? 0;
  const available = on_hand - reserved;
  const threshold = level?.low_stock_threshold ?? null;
  return {
    location_id: level?.location_id ?? fallbackLocationId,
    on_hand,
    reserved,
    available,
    low_stock_threshold: threshold,
    state: stockState(tracked, available, threshold),
  };
}

/**
 * Stock levels and the immutable movement ledger (PRD §8.8 rule 8, §9).
 * Every change runs in a transaction that row-locks the level (SELECT … FOR
 * UPDATE), so concurrent adjustments serialize and can't lose updates.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async defaultLocation(client: Pick<Tx, "inventoryLocation">, storeId: string) {
    const loc = await client.inventoryLocation.findFirst({
      where: { store_id: storeId, is_default: true },
    });
    if (loc) return loc;
    // Stores created before inventory existed, or by future store-creation code.
    try {
      return await client.inventoryLocation.create({
        data: { store_id: storeId, name: "Main location", is_default: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return client.inventoryLocation.findFirstOrThrow({
          where: { store_id: storeId, is_default: true },
        });
      }
      throw err;
    }
  }

  /** Creates the level row if missing, then locks it for the rest of the transaction. */
  private async lockLevel(
    tx: Tx,
    storeId: string,
    variantId: string,
    locationId: string,
  ): Promise<LockedLevel> {
    await tx.$executeRaw`
      INSERT INTO inventory_levels (id, store_id, variant_id, location_id, on_hand, reserved, updated_at)
      VALUES (gen_random_uuid(), ${storeId}::uuid, ${variantId}::uuid, ${locationId}::uuid, 0, 0, now())
      ON CONFLICT (variant_id, location_id) DO NOTHING`;
    const rows = await tx.$queryRaw<LockedLevel[]>`
      SELECT id, on_hand, reserved, low_stock_threshold FROM inventory_levels
      WHERE variant_id = ${variantId}::uuid AND location_id = ${locationId}::uuid
      FOR UPDATE`;
    return rows[0]!;
  }

  /**
   * Applies a stock change inside an existing transaction. Used by adjustments
   * and by product creation (initial stock). Returns the new on-hand count.
   */
  async applyInTx(
    tx: Tx,
    args: {
      store_id: string;
      variant_id: string;
      location_id?: string;
      mode: "delta" | "set";
      quantity: number;
      type: StockMovementType;
      reason?: string | null;
      reference?: { type: string; id: string };
      actor_id: string | null;
      request_id?: string;
    },
  ): Promise<{ before: number; after: number; location_id: string }> {
    const locationId = args.location_id ?? (await this.defaultLocation(tx, args.store_id)).id;
    const level = await this.lockLevel(tx, args.store_id, args.variant_id, locationId);
    const before = level.on_hand;
    const delta = args.mode === "set" ? args.quantity - before : args.quantity;
    if (delta === 0) {
      throw new AppException(
        CATALOG_ERROR_CODES.INVENTORY_NO_CHANGE,
        `Stock is already ${before}.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        [{ path: "quantity", message: `Stock is already ${before}.`, code: "no_change" }],
      );
    }
    const after = before + delta;
    await tx.inventoryLevel.update({ where: { id: level.id }, data: { on_hand: after } });
    await tx.stockMovement.create({
      data: {
        store_id: args.store_id,
        variant_id: args.variant_id,
        location_id: locationId,
        movement_type: args.type,
        quantity_delta: delta,
        quantity_before: before,
        quantity_after: after,
        reason: args.reason ?? null,
        reference_type: args.reference?.type ?? null,
        reference_id: args.reference?.id ?? null,
        actor_id: args.actor_id,
        request_id: args.request_id,
      },
    });
    return { before, after, location_id: locationId };
  }

  async adjust(input: InventoryAdjust, actor: InventoryActor): Promise<InventoryRow> {
    await this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findFirst({
        where: storeScoped(actor.store_id, {
          id: input.variant_id,
          deleted_at: null,
          product: { deleted_at: null },
        }),
        select: { id: true, inventory_tracking: true },
      });
      if (!variant) throw this.variantNotFound();
      if (!variant.inventory_tracking) {
        throw new AppException(
          CATALOG_ERROR_CODES.INVENTORY_NOT_TRACKED,
          "Turn on inventory tracking for this variant before adjusting stock.",
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      if (input.location_id) {
        const loc = await tx.inventoryLocation.findFirst({
          where: storeScoped(actor.store_id, { id: input.location_id, status: "active" as const }),
        });
        if (!loc)
          throw AppException.validation([
            { path: "location_id", message: "Location not found.", code: "not_found" },
          ]);
      }
      const note = input.note ? input.note : null;
      await this.applyInTx(tx, {
        store_id: actor.store_id,
        variant_id: variant.id,
        location_id: input.location_id,
        mode: input.mode,
        quantity: input.quantity,
        type: input.reason,
        reason: note,
        actor_id: actor.user_id,
        request_id: actor.request_id,
      });
    });
    const row = (await this.rows(actor.store_id, { variantId: input.variant_id }))[0];
    if (!row) throw this.variantNotFound();
    return row;
  }

  async setThreshold(
    tx: Tx,
    storeId: string,
    variantId: string,
    threshold: number | null,
  ): Promise<void> {
    const locationId = (await this.defaultLocation(tx, storeId)).id;
    await tx.inventoryLevel.upsert({
      where: { variant_id_location_id: { variant_id: variantId, location_id: locationId } },
      update: { low_stock_threshold: threshold },
      create: {
        store_id: storeId,
        variant_id: variantId,
        location_id: locationId,
        low_stock_threshold: threshold,
      },
    });
  }

  async list(
    storeId: string,
    q: InventoryListQuery,
  ): Promise<Omit<ListResponse<InventoryRow>, "request_id">> {
    const filters: Prisma.Sql[] = [];
    if (q.q) {
      const like = `%${q.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      filters.push(
        Prisma.sql`(p.title ILIKE ${like} OR v.sku ILIKE ${like} OR v.barcode = ${q.q} OR v.title ILIKE ${like})`,
      );
    }
    if (q.stock === "out")
      filters.push(
        Prisma.sql`v.inventory_tracking AND (COALESCE(l.on_hand,0) - COALESCE(l.reserved,0)) <= 0`,
      );
    if (q.stock === "low") {
      filters.push(Prisma.sql`v.inventory_tracking AND l.low_stock_threshold IS NOT NULL
        AND (l.on_hand - l.reserved) > 0 AND (l.on_hand - l.reserved) <= l.low_stock_threshold`);
    }
    const order =
      q.sort === "available"
        ? Prisma.sql`(COALESCE(l.on_hand,0) - COALESCE(l.reserved,0))`
        : q.sort === "updated_at"
          ? Prisma.sql`COALESCE(l.updated_at, v.updated_at)`
          : Prisma.sql`p.title`;
    const dir = q.order === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const total = await this.count(storeId, filters);
    const rows = await this.rows(storeId, {
      filters,
      order: Prisma.sql`${order} ${dir}, p.title ASC, v.position ASC, v.id ASC`,
      limit: q.page_size,
      offset: (q.page - 1) * q.page_size,
    });
    return {
      data: rows,
      meta: {
        page: q.page,
        page_size: q.page_size,
        total,
        total_pages: Math.ceil(total / q.page_size),
      },
    };
  }

  async movements(
    storeId: string,
    q: MovementListQuery,
  ): Promise<Omit<ListResponse<StockMovementSummary>, "request_id">> {
    const variant = await this.prisma.productVariant.findFirst({
      where: storeScoped(storeId, { id: q.variant_id }),
    });
    if (!variant) throw this.variantNotFound();
    const where = storeScoped(storeId, { variant_id: q.variant_id });
    const [total, rows] = await Promise.all([
      this.prisma.stockMovement.count({ where }),
      this.prisma.stockMovement.findMany({
        where,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        skip: (q.page - 1) * q.page_size,
        take: q.page_size,
        include: { location: { select: { name: true } } },
      }),
    ]);
    const actorIds = [
      ...new Set(rows.map((r) => r.actor_id).filter((x): x is string => Boolean(x))),
    ];
    const users = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return {
      data: rows.map((m) => ({
        id: m.id,
        movement_type: m.movement_type,
        quantity_delta: m.quantity_delta,
        quantity_before: m.quantity_before,
        quantity_after: m.quantity_after,
        reason: m.reason,
        reference_type: m.reference_type,
        reference_id: m.reference_id,
        actor: (m.actor_id && byId.get(m.actor_id)) || null,
        location_name: m.location.name,
        created_at: m.created_at.toISOString(),
      })),
      meta: {
        page: q.page,
        page_size: q.page_size,
        total,
        total_pages: Math.ceil(total / q.page_size),
      },
    };
  }

  // ───────────── Queries (raw SQL: available = on_hand − reserved needs column arithmetic) ─────────────

  private baseFrom(storeId: string) {
    return Prisma.sql`
      FROM product_variants v
      JOIN products p ON p.id = v.product_id AND p.deleted_at IS NULL
      JOIN inventory_locations loc ON loc.store_id = v.store_id AND loc.is_default
      LEFT JOIN inventory_levels l ON l.variant_id = v.id AND l.location_id = loc.id
      WHERE v.store_id = ${storeId}::uuid AND v.deleted_at IS NULL`;
  }

  private async count(storeId: string, filters: Prisma.Sql[]): Promise<number> {
    const where = filters.length ? Prisma.sql` AND ${Prisma.join(filters, " AND ")}` : Prisma.empty;
    const [r] = await this.prisma.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*)::bigint AS n ${this.baseFrom(storeId)} ${where}`;
    return Number(r?.n ?? 0);
  }

  private async rows(
    storeId: string,
    opts: {
      variantId?: string;
      filters?: Prisma.Sql[];
      order?: Prisma.Sql;
      limit?: number;
      offset?: number;
    },
  ): Promise<InventoryRow[]> {
    const filters = [...(opts.filters ?? [])];
    if (opts.variantId) filters.push(Prisma.sql`v.id = ${opts.variantId}::uuid`);
    const where = filters.length ? Prisma.sql` AND ${Prisma.join(filters, " AND ")}` : Prisma.empty;
    const raw = await this.prisma.$queryRaw<
      {
        variant_id: string;
        product_id: string;
        product_title: string;
        variant_title: string;
        product_type: "simple" | "variable";
        sku: string | null;
        thumbnail_url: string | null;
        inventory_tracking: boolean;
        location_id: string;
        location_name: string;
        on_hand: number;
        reserved: number;
        low_stock_threshold: number | null;
        updated_at: Date;
      }[]
    >`
      SELECT v.id AS variant_id, p.id AS product_id, p.title AS product_title, v.title AS variant_title,
             p.product_type::text AS product_type, v.sku, v.inventory_tracking,
             loc.id AS location_id, loc.name AS location_name,
             COALESCE(l.on_hand, 0) AS on_hand, COALESCE(l.reserved, 0) AS reserved, l.low_stock_threshold,
             COALESCE(l.updated_at, v.updated_at) AS updated_at,
             (SELECT COALESCE(d.url, a.url) FROM media_assets a
                LEFT JOIN media_derivatives d ON d.media_asset_id = a.id AND d.name = 'thumb'
                WHERE a.id = COALESCE(v.media_asset_id,
                  (SELECT pm.media_asset_id FROM product_media pm WHERE pm.product_id = p.id AND pm.is_primary LIMIT 1))
             ) AS thumbnail_url
      ${this.baseFrom(storeId)} ${where}
      ORDER BY ${opts.order ?? Prisma.sql`p.title ASC, v.position ASC`}
      ${opts.limit ? Prisma.sql`LIMIT ${opts.limit} OFFSET ${opts.offset ?? 0}` : Prisma.empty}`;
    return raw.map((r) => {
      const available = r.on_hand - r.reserved;
      return {
        ...r,
        available,
        state: stockState(r.inventory_tracking, available, r.low_stock_threshold),
        updated_at: r.updated_at.toISOString(),
      };
    });
  }

  private variantNotFound() {
    return new AppException(
      CATALOG_ERROR_CODES.VARIANT_NOT_FOUND,
      "Variant not found.",
      HttpStatus.NOT_FOUND,
    );
  }
}
