import { Injectable } from "@nestjs/common";
import type { Prisma } from "@cartforge/database";
import { InventoryService } from "../inventory/inventory.service";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

type Tx = Prisma.TransactionClient;

export interface ReservationNeed {
  variant_id: string;
  quantity: number;
}

export interface Shortfall {
  variant_id: string;
  available: number;
}

/**
 * Checkout stock holds (PRD INV-003/004, §9.3). `inventory_levels.reserved` is
 * the sum of active reservations, changed only here and always under the level's
 * row lock, so concurrent checkouts can't both take the last unit.
 */
@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Releases expired holds. Runs before every reservation decision and, at most
   * once a minute per store, before storefront reads (no background worker needed).
   */
  async sweep(storeId: string, opts: { throttle?: boolean } = {}): Promise<number> {
    if (opts.throttle) {
      const ok = await this.redis.set(`reservations:sweep:${storeId}`, "1", "EX", 60, "NX");
      if (ok !== "OK") return 0;
    }
    return this.prisma.$transaction((tx) => this.sweepIn(tx, storeId));
  }

  async sweepIn(tx: Tx, storeId: string): Promise<number> {
    const expired = await tx.$queryRaw<
      { variant_id: string; location_id: string; quantity: number }[]
    >`
      UPDATE inventory_reservations SET status = 'expired', updated_at = now()
      WHERE store_id = ${storeId}::uuid AND status = 'active' AND expires_at < now()
      RETURNING variant_id, location_id, quantity`;
    await this.decrement(tx, expired);
    return expired.length;
  }

  /**
   * Replaces a checkout's holds with `needs` (expiring in `minutes`). Returns the
   * lines that couldn't be fully held; nothing is held for those.
   */
  async hold(
    tx: Tx,
    args: { store_id: string; checkout_id: string; needs: ReservationNeed[]; minutes: number },
  ): Promise<Shortfall[]> {
    await this.sweepIn(tx, args.store_id);
    await this.releaseIn(tx, args.checkout_id);
    const location = await this.inventory.defaultLocation(tx, args.store_id);
    const expires = new Date(Date.now() + args.minutes * 60_000);
    const shortfalls: Shortfall[] = [];
    // Lock in a stable order so two checkouts never wait on each other in a cycle.
    for (const need of [...args.needs].sort((a, b) => a.variant_id.localeCompare(b.variant_id))) {
      const level = await this.inventory.lockLevel(tx, args.store_id, need.variant_id, location.id);
      const available = level.on_hand - level.reserved;
      if (available < need.quantity) {
        shortfalls.push({ variant_id: need.variant_id, available: Math.max(0, available) });
        continue;
      }
      await tx.inventoryLevel.update({
        where: { id: level.id },
        data: { reserved: { increment: need.quantity } },
      });
      await tx.inventoryReservation.create({
        data: {
          store_id: args.store_id,
          variant_id: need.variant_id,
          location_id: location.id,
          checkout_id: args.checkout_id,
          quantity: need.quantity,
          expires_at: expires,
        },
      });
    }
    return shortfalls;
  }

  async releaseIn(tx: Tx, checkoutId: string): Promise<void> {
    const released = await tx.$queryRaw<
      { variant_id: string; location_id: string; quantity: number }[]
    >`
      UPDATE inventory_reservations SET status = 'released', updated_at = now()
      WHERE checkout_id = ${checkoutId}::uuid AND status = 'active'
      RETURNING variant_id, location_id, quantity`;
    await this.decrement(tx, released);
  }

  /** Converts a checkout's holds into a sale: reserved −= q (on_hand is reduced by the caller's sale movement). */
  async consumeIn(tx: Tx, checkoutId: string): Promise<Map<string, number>> {
    const used = await tx.$queryRaw<
      { variant_id: string; location_id: string; quantity: number }[]
    >`
      UPDATE inventory_reservations SET status = 'consumed', updated_at = now()
      WHERE checkout_id = ${checkoutId}::uuid AND status = 'active'
      RETURNING variant_id, location_id, quantity`;
    await this.decrement(tx, used);
    const held = new Map<string, number>();
    for (const r of used) held.set(r.variant_id, (held.get(r.variant_id) ?? 0) + r.quantity);
    return held;
  }

  /** Active holds of one checkout by variant (to count them as the shopper's own stock). */
  async heldBy(
    client: Pick<Tx, "inventoryReservation">,
    checkoutId: string,
  ): Promise<Map<string, number>> {
    const rows = await client.inventoryReservation.findMany({
      where: { checkout_id: checkoutId, status: "active", expires_at: { gt: new Date() } },
      select: { variant_id: true, quantity: true },
    });
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.variant_id, (m.get(r.variant_id) ?? 0) + r.quantity);
    return m;
  }

  private async decrement(
    tx: Tx,
    rows: { variant_id: string; location_id: string; quantity: number }[],
  ): Promise<void> {
    const sorted = [...rows].sort((a, b) => a.variant_id.localeCompare(b.variant_id));
    for (const r of sorted) {
      // GREATEST keeps the counter sane even if it was ever edited by hand.
      await tx.$executeRaw`
        UPDATE inventory_levels SET reserved = GREATEST(reserved - ${r.quantity}, 0), updated_at = now()
        WHERE variant_id = ${r.variant_id}::uuid AND location_id = ${r.location_id}::uuid`;
    }
  }
}
