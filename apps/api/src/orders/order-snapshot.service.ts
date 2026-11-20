import { HttpStatus, Injectable, Module } from "@nestjs/common";
import type { OrderItem, Prisma } from "@cartforge/database";
import { CATALOG_ERROR_CODES } from "@cartforge/types";
import { AppException } from "../common/app-exception";

type Tx = Prisma.TransactionClient;

/**
 * Builds order lines as immutable snapshots (PRD §8.8 rules 5 & 7, §13.3).
 * Price, title, SKU and options are read from the server-side catalog at
 * purchase time and copied — never taken from the client and never re-read
 * later. Checkout (Next 4) calls this inside its order-creation transaction.
 */
@Injectable()
export class OrderSnapshotService {
  async addLine(
    tx: Tx,
    args: {
      store_id: string;
      order_id: string;
      variant_id: string;
      quantity: number;
      tax_minor?: number;
      discount_minor?: number;
    },
  ): Promise<OrderItem> {
    const v = await tx.productVariant.findFirst({
      where: {
        id: args.variant_id,
        store_id: args.store_id,
        deleted_at: null,
        product: { deleted_at: null, status: "active" },
      },
      include: {
        product: { select: { id: true, title: true, product_type: true } },
        option_values: { include: { option_value: { include: { option: true } } } },
      },
    });
    if (!v)
      throw new AppException(
        CATALOG_ERROR_CODES.VARIANT_NOT_FOUND,
        "This item is no longer available.",
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    if (v.price_minor === null) {
      throw new AppException(
        CATALOG_ERROR_CODES.PRODUCT_NOT_PUBLISHABLE,
        "This item has no price.",
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return tx.orderItem.create({
      data: {
        store_id: args.store_id,
        order_id: args.order_id,
        product_id: v.product.id,
        variant_id: v.id,
        product_title: v.product.title,
        variant_title: v.product.product_type === "simple" ? "" : v.title,
        sku: v.sku,
        option_values: [...v.option_values]
          .sort((a, b) => a.option_value.option.position - b.option_value.option.position)
          .map((ov) => ({ option: ov.option_value.option.name, value: ov.option_value.value })),
        quantity: args.quantity,
        unit_price_minor: v.price_minor,
        tax_minor: BigInt(args.tax_minor ?? 0),
        discount_minor: BigInt(args.discount_minor ?? 0),
        currency: v.currency ?? "USD",
      },
    });
  }
}

@Module({ providers: [OrderSnapshotService], exports: [OrderSnapshotService] })
export class OrdersModule {}
