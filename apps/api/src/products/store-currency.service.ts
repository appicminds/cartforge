import { HttpStatus, Injectable } from "@nestjs/common";
import { PLATFORM_ERROR_CODES, type StoreCurrencyResult } from "@cartforge/types";
import { currencyExponent } from "@cartforge/validation";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { PrismaService } from "../prisma/prisma.service";
import { StorefrontRevalidator, CATALOG_TAG } from "../storefront/revalidation";

const KNOWN = new Set(Intl.supportedValuesOf("currency"));

/**
 * Changes a store's currency before its first order, keeping the prices people see:
 * "4,799.00 USD" becomes "Rs 4,799". Amounts are stored in minor units, so they are
 * re-scaled between the currencies' decimal places (USD 2 → PKR 0 divides by 100).
 * Not an exchange-rate conversion.
 */
@Injectable()
export class StoreCurrencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidator: StorefrontRevalidator,
  ) {}

  async change(
    storeId: string,
    to: string,
    actor: { user_id: string; request_id: string },
  ): Promise<StoreCurrencyResult> {
    if (!KNOWN.has(to))
      throw AppException.validation([
        { path: "currency", message: "Unknown currency", code: "invalid" },
      ]);
    const result = await this.prisma.$transaction(async (tx) => {
      // Lock the store row so no order can slip in while amounts change.
      const rows = await tx.$queryRaw<{ currency: string }[]>`
        SELECT currency FROM stores WHERE id = ${storeId}::uuid FOR UPDATE`;
      if (!rows.length) throw AppException.notFound("Store");
      const from = rows[0]!.currency.trim();
      if (from === to)
        throw AppException.validation([
          { path: "currency", message: `The store already sells in ${to}.`, code: "same" },
        ]);
      if (await tx.order.count({ where: { store_id: storeId } }))
        throw new AppException(
          PLATFORM_ERROR_CODES.STORE_HAS_ORDERS,
          "This store already has orders, so its currency can't change.",
          HttpStatus.CONFLICT,
        );

      const shift = currencyExponent(to) - currencyExponent(from);
      let rounded = 0;
      const scale = (v: bigint | null): bigint | null => {
        if (v === null || shift === 0) return v;
        if (shift > 0) return v * 10n ** BigInt(shift);
        const d = 10n ** BigInt(-shift);
        if (v % d !== 0n) rounded++;
        return (v + d / 2n) / d; // amounts are never negative
      };

      const variants = await tx.productVariant.findMany({
        where: { store_id: storeId },
        select: { id: true, price_minor: true, compare_at_minor: true, cost_minor: true },
      });
      for (const v of variants)
        await tx.productVariant.update({
          where: { id: v.id },
          data: {
            price_minor: scale(v.price_minor),
            compare_at_minor: scale(v.compare_at_minor),
            cost_minor: scale(v.cost_minor),
            currency: to,
          },
        });

      const methods = await tx.shippingMethod.findMany({ where: { store_id: storeId } });
      for (const m of methods)
        await tx.shippingMethod.update({
          where: { id: m.id },
          data: {
            price_minor: scale(m.price_minor)!,
            free_over_minor: scale(m.free_over_minor),
            min_order_minor: scale(m.min_order_minor),
            max_order_minor: scale(m.max_order_minor),
            per_item_minor: scale(m.per_item_minor)!,
          },
        });

      // Carts are priced in the old currency; shoppers start again.
      const carts = await tx.cart.deleteMany({ where: { store_id: storeId } });
      await tx.store.update({ where: { id: storeId }, data: { currency: to } });

      const out: StoreCurrencyResult = {
        store_id: storeId,
        from,
        to,
        variants: variants.length,
        shipping_methods: methods.length,
        rounded,
        carts_cleared: carts.count,
      };
      await this.audit.recordIn(tx, {
        action: "store.currency_changed",
        resource_type: "store",
        resource_id: storeId,
        store_id: storeId,
        actor_user_id: actor.user_id,
        request_id: actor.request_id,
        metadata: { ...out },
      });
      return out;
    });
    await this.revalidator.notify([`${CATALOG_TAG}:${storeId}`]);
    return result;
  }
}
