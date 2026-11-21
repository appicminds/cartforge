import { HttpStatus, Injectable } from "@nestjs/common";
import type { Cart, Prisma } from "@cartforge/database";
import {
  COMMERCE_ERROR_CODES,
  type CartLineView,
  type CartNotice,
  type CartView,
} from "@cartforge/types";
import { MAX_LINE_QUANTITY } from "@cartforge/validation";
import { generateToken, sha256 } from "../auth/tokens";
import { AppException } from "../common/app-exception";
import { formatMinor } from "./format";
import { PrismaService } from "../prisma/prisma.service";
import { MarketsService, type ResolvedMarket } from "./markets/markets.service";
import { ReservationsService } from "./reservations.service";

type Client = Prisma.TransactionClient;

const LINE_INCLUDE = {
  variant: {
    include: {
      product: {
        include: {
          media: {
            orderBy: [{ is_primary: "desc" }, { position: "asc" }],
            include: { asset: { include: { derivatives: true } } },
          },
        },
      },
      option_values: { include: { option_value: { include: { option: true } } } },
      inventory: { where: { location: { is_default: true } } },
    },
  },
} as const satisfies Prisma.CartLineInclude;

type LineRow = Prisma.CartLineGetPayload<{ include: typeof LINE_INCLUDE }>;

export const cartNotFound = () =>
  new AppException(
    COMMERCE_ERROR_CODES.CART_NOT_FOUND,
    "Your cart has expired. Please add your items again.",
    HttpStatus.NOT_FOUND,
  );

const unavailable = () =>
  new AppException(
    COMMERCE_ERROR_CODES.ITEM_UNAVAILABLE,
    "This item is no longer available.",
    HttpStatus.UNPROCESSABLE_ENTITY,
  );

export function purchasable(v: LineRow["variant"]): boolean {
  return (
    !v.deleted_at &&
    !v.product.deleted_at &&
    v.product.status === "active" &&
    v.price_minor !== null
  );
}

/** Most a shopper can buy of this variant right now (their own holds count as theirs). null = unlimited. */
export function maxQuantity(v: LineRow["variant"], ownHeld: number): number | null {
  if (!v.inventory_tracking || v.continue_selling) return MAX_LINE_QUANTITY;
  const level = v.inventory[0];
  const free = (level?.on_hand ?? 0) - (level?.reserved ?? 0) + ownHeld;
  return Math.max(0, Math.min(MAX_LINE_QUANTITY, free));
}

/**
 * Guest carts (PRD §13.1). Every read re-validates each line against the live
 * catalog: availability, price and variant status. Changes are applied and
 * reported once as notices, so the shopper is never charged a price they
 * haven't seen.
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
    private readonly markets: MarketsService,
  ) {}

  /** A cart priced in the shopper's market. */
  async create(storeId: string, market: ResolvedMarket): Promise<{ token: string; cart: Cart }> {
    const token = generateToken(32);
    const cart = await this.prisma.cart.create({
      data: {
        store_id: storeId,
        token_hash: sha256(token),
        currency: market.currency,
        market_id: market.id,
      },
    });
    return { token, cart };
  }

  /** The shopper changed country/currency: re-price the cart in that market. */
  async setMarket(cart: Cart, marketId: string | null): Promise<CartView> {
    return this.prisma.$transaction(async (tx) => {
      const market = await this.markets.resolve(cart.store_id, marketId, null, tx);
      const next = await tx.cart.update({
        where: { id: cart.id },
        data: { market_id: market.id, currency: market.currency, updated_at: new Date() },
      });
      // New currency: the shopper sees fresh prices, not "price changed" notices.
      if (next.currency !== cart.currency)
        await tx.cartLine.updateMany({
          where: { cart_id: cart.id },
          data: { seen_price_minor: null },
        });
      return this.viewIn(tx, next);
    });
  }

  /** The cart's market (falls back to primary if it went away) and prices for variants. */
  private async pricing(
    tx: Client,
    cart: Cart,
    variants: { id: string; price_minor: bigint | null; compare_at_minor: bigint | null }[],
  ) {
    const market = await this.markets.resolve(cart.store_id, cart.market_id, null, tx);
    const prices = await this.markets.priceVariants(
      market,
      variants.map((v) => ({
        id: v.id,
        price_minor: v.price_minor === null ? null : Number(v.price_minor),
        compare_at_minor: v.compare_at_minor === null ? null : Number(v.compare_at_minor),
      })),
      tx,
    );
    return { market, prices };
  }

  /** `allowConverted`: order completion must still find the cart to replay a retried request. */
  async resolve(
    storeId: string,
    token: string | undefined,
    opts: { allowConverted?: boolean } = {},
  ): Promise<Cart> {
    if (!token || token.length < 20 || token.length > 100) throw cartNotFound();
    const cart = await this.prisma.cart.findUnique({ where: { token_hash: sha256(token) } });
    if (!cart || cart.store_id !== storeId) throw cartNotFound();
    if (cart.status !== "active" && !opts.allowConverted) throw cartNotFound();
    return cart;
  }

  async addLine(cart: Cart, variantId: string, quantity: number): Promise<CartView> {
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.productVariant.findFirst({
        where: { id: variantId, store_id: cart.store_id },
        include: LINE_INCLUDE.variant.include,
      });
      if (!v || !purchasable(v)) throw unavailable();
      const { market, prices } = await this.pricing(tx, cart, [v]);
      if (market.id && v.product.hidden_market_ids.includes(market.id))
        throw new AppException(
          COMMERCE_ERROR_CODES.ITEM_UNAVAILABLE,
          "This item isn't sold in your country.",
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      const marketPrice = BigInt(prices.get(v.id)!.price_minor!);
      const held = await this.ownHeld(tx, cart.id);
      const max = maxQuantity(v, held.get(v.id) ?? 0) ?? MAX_LINE_QUANTITY;
      if (max <= 0) {
        throw new AppException(
          COMMERCE_ERROR_CODES.INSUFFICIENT_STOCK,
          "This item is sold out.",
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      const existing = await tx.cartLine.findUnique({
        where: { cart_id_variant_id: { cart_id: cart.id, variant_id: v.id } },
      });
      const wanted = (existing?.quantity ?? 0) + quantity;
      const next = Math.min(wanted, max);
      await tx.cartLine.upsert({
        where: { cart_id_variant_id: { cart_id: cart.id, variant_id: v.id } },
        create: {
          cart_id: cart.id,
          store_id: cart.store_id,
          variant_id: v.id,
          quantity: next,
          seen_price_minor: marketPrice,
        },
        update: { quantity: next, seen_price_minor: marketPrice },
      });
      await tx.cart.update({ where: { id: cart.id }, data: { updated_at: new Date() } });
      const view = await this.viewIn(tx, cart);
      if (next < wanted) {
        view.notices.unshift({
          kind: "quantity_reduced",
          line_id: null,
          title: v.product.title,
          message:
            existing && existing.quantity >= max
              ? `You already have all available stock of ${v.product.title} in your cart.`
              : `Only ${max} of ${v.product.title} available — your cart has ${next}.`,
        });
      }
      return view;
    });
  }

  async updateLine(cart: Cart, lineId: string, quantity: number): Promise<CartView> {
    return this.prisma.$transaction(async (tx) => {
      const line = await tx.cartLine.findFirst({ where: { id: lineId, cart_id: cart.id } });
      if (!line) throw this.lineNotFound();
      if (quantity === 0) await tx.cartLine.delete({ where: { id: line.id } });
      else await tx.cartLine.update({ where: { id: line.id }, data: { quantity } });
      return this.viewIn(tx, cart); // clamps to stock and reports it
    });
  }

  async removeLine(cart: Cart, lineId: string): Promise<CartView> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.cartLine.deleteMany({ where: { id: lineId, cart_id: cart.id } });
      if (!count) throw this.lineNotFound();
      return this.viewIn(tx, cart);
    });
  }

  view(cart: Cart): Promise<CartView> {
    return this.prisma.$transaction((tx) => this.viewIn(tx, cart));
  }

  /** Re-validates every line (applying and reporting changes) and builds the view. */
  async viewIn(tx: Client, cart: Cart): Promise<CartView> {
    const rows = await tx.cartLine.findMany({
      where: { cart_id: cart.id },
      include: LINE_INCLUDE,
      orderBy: { created_at: "asc" },
    });
    const { market, prices } = await this.pricing(
      tx,
      cart,
      rows.map((r) => r.variant),
    );
    // The market went away (deleted, paused, rate unavailable): continue in the primary one.
    if (market.currency !== cart.currency || market.id !== cart.market_id) {
      // In place, so the caller's cart object follows the switch too.
      Object.assign(
        cart,
        await tx.cart.update({
          where: { id: cart.id },
          data: { market_id: market.id, currency: market.currency },
        }),
      );
      await tx.cartLine.updateMany({
        where: { cart_id: cart.id },
        data: { seen_price_minor: null },
      });
      for (const r of rows) r.seen_price_minor = null;
    }
    const held = await this.ownHeld(tx, cart.id);
    const notices: CartNotice[] = [];
    const lines: CartLineView[] = [];
    for (const row of rows) {
      const v = row.variant;
      const title = v.product.title;
      if (!purchasable(v) || (market.id && v.product.hidden_market_ids.includes(market.id))) {
        const elsewhere = purchasable(v);
        await tx.cartLine.delete({ where: { id: row.id } });
        notices.push({
          kind: "removed_unavailable",
          line_id: null,
          title,
          message: elsewhere
            ? `${title} isn't sold in your country and was removed from your cart.`
            : `${title} is no longer available and was removed from your cart.`,
        });
        continue;
      }
      const price = prices.get(v.id)!.price_minor!;
      const max = maxQuantity(v, held.get(v.id) ?? 0);
      let quantity = row.quantity;
      const patch: Prisma.CartLineUpdateInput = {};
      if (max !== null && max > 0 && quantity > max) {
        quantity = max;
        patch.quantity = max;
        notices.push({
          kind: "quantity_reduced",
          line_id: row.id,
          title,
          message: `Only ${max} of ${title} available — we updated your cart.`,
        });
      }
      if (max === 0) {
        notices.push({
          kind: "sold_out",
          line_id: row.id,
          title,
          message: `${title} just sold out. Remove it to continue.`,
        });
      }
      if (row.seen_price_minor !== null && Number(row.seen_price_minor) !== price) {
        notices.push({
          kind: "price_changed",
          line_id: row.id,
          title,
          message: `The price of ${title} changed from ${formatMinor(Number(row.seen_price_minor), cart.currency)} to ${formatMinor(price, cart.currency)}.`,
        });
      }
      if (row.seen_price_minor === null || Number(row.seen_price_minor) !== price)
        patch.seen_price_minor = BigInt(price);
      if (Object.keys(patch).length)
        await tx.cartLine.update({ where: { id: row.id }, data: patch });
      lines.push(this.toLine(row, quantity, price, max));
    }
    const subtotal = lines.reduce((a, l) => a + l.line_total_minor, 0);
    return {
      id: cart.id,
      currency: cart.currency,
      lines,
      item_count: lines.reduce((a, l) => a + l.quantity, 0),
      subtotal_minor: subtotal,
      requires_shipping: lines.some((l) => l.requires_shipping),
      notices,
      ready: lines.length > 0 && lines.every((l) => l.available),
    };
  }

  private async ownHeld(tx: Client, cartId: string): Promise<Map<string, number>> {
    const checkout = await tx.checkout.findUnique({
      where: { cart_id: cartId },
      select: { id: true },
    });
    return checkout ? this.reservations.heldBy(tx, checkout.id) : new Map();
  }

  private toLine(row: LineRow, quantity: number, price: number, max: number | null): CartLineView {
    const v = row.variant;
    const media =
      v.product.media.find((m) => m.media_asset_id === v.media_asset_id) ?? v.product.media[0];
    const asset = media?.asset ?? null;
    const thumb = asset
      ? (asset.derivatives.find((d) => d.name === "thumb")?.url ?? asset.url)
      : null;
    return {
      id: row.id,
      variant_id: v.id,
      product_id: v.product.id,
      product_handle: v.product.handle,
      product_title: v.product.title,
      variant_title: v.product.product_type === "simple" ? "" : v.title,
      options: [...v.option_values]
        .sort((a, b) => a.option_value.option.position - b.option_value.option.position)
        .map((ov) => ({ option: ov.option_value.option.name, value: ov.option_value.value })),
      image: thumb ? { url: thumb, alt: media?.alt_text ?? asset?.alt_text ?? null } : null,
      quantity,
      unit_price_minor: price,
      compare_at_minor: v.compare_at_minor === null ? null : Number(v.compare_at_minor),
      line_total_minor: price * quantity,
      requires_shipping: v.product.requires_shipping,
      available: max === null || max > 0,
      max_quantity: max,
    };
  }

  private lineNotFound() {
    return new AppException(
      COMMERCE_ERROR_CODES.CART_LINE_NOT_FOUND,
      "That item isn't in your cart any more.",
      HttpStatus.NOT_FOUND,
    );
  }
}
