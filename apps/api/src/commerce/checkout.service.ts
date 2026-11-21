import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type Cart, type Checkout } from "@cartforge/database";
import {
  computeTotals,
  quoteShipping,
  convertAmount,
  marketCountries,
  toStoreCurrency,
  COUNTRY_CODES,
  resolveTax,
  type ResolvedTax,
  shippingCountries,
  validateCustomFields,
  type CheckoutSettings,
  type Totals,
} from "@cartforge/checkout-engine";
import {
  COMMERCE_ERROR_CODES,
  type CartView,
  type CheckoutView,
  type CommerceAddress,
  type FieldError,
  type PlacedOrder,
  type ShippingOption,
  type OnlineProviderKey,
} from "@cartforge/types";
import type { CheckoutUpdate } from "@cartforge/validation";
import { generateToken, sha256 } from "../auth/tokens";
import { AppException } from "../common/app-exception";
import { OrderMailer } from "./order-mailer";
import { PaymentAccountsService } from "./payments/accounts.service";
import { isOnlineProvider } from "./payments/registry";
import { OutboxService } from "../common/outbox.service";
import { InventoryService } from "../inventory/inventory.service";
import { OrderSnapshotService } from "../orders/order-snapshot.service";
import { PrismaService } from "../prisma/prisma.service";
import { CartService } from "./cart.service";
import { MarketsService, type ResolvedMarket } from "./markets/markets.service";
import { enabledProviders, providerFor } from "./payments";
import { ReservationsService } from "./reservations.service";
import { CommerceSettingsService, toShippingConfig } from "./settings.service";

type Tx = Prisma.TransactionClient;

interface Built {
  view: CheckoutView;
  settings: CheckoutSettings;
  /** Connected online providers usable for this cart's currency. */
  online: OnlineProviderKey[];
  totals: Totals;
  shipping: ShippingOption | null;
  shortfalls: string[];
  /** The rate and label for this destination. */
  tax: ResolvedTax;
  market: ResolvedMarket;
}

const MISSING_LABELS: Record<string, string> = {
  items: "Your cart has items that can't be bought right now.",
  stock: "Some items just sold out.",
  email: "Enter your email address.",
  phone: "Enter a phone number.",
  shipping_address: "Enter a shipping address.",
  billing_address: "Enter a billing address.",
  shipping_method: "Choose a shipping method.",
  payment_method: "Choose a payment method.",
  custom_fields: "Complete the required fields.",
  terms: "Accept the terms to continue.",
};

const asAddress = (v: Prisma.JsonValue | null): CommerceAddress | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as unknown as CommerceAddress) : null;

const json = (v: CommerceAddress | null) =>
  v ? (v as unknown as Prisma.InputJsonValue) : Prisma.DbNull;

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 };

/**
 * Checkout (PRD §13.2–13.3). Everything that affects money is recomputed here
 * from the catalog and store settings on every step; the client only ever sends
 * choices (address, method keys), never amounts.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly reservations: ReservationsService,
    private readonly settings: CommerceSettingsService,
    private readonly inventory: InventoryService,
    private readonly snapshots: OrderSnapshotService,
    private readonly outbox: OutboxService,
    private readonly mail: OrderMailer,
    private readonly accounts: PaymentAccountsService,
    private readonly markets: MarketsService,
  ) {}

  /** Starts (or resumes) checkout for a cart and holds its stock. */
  async open(cart: Cart): Promise<CheckoutView> {
    return this.prisma.$transaction(async (tx) => {
      const checkout = await this.ensure(tx, cart);
      return (await this.build(tx, cart, checkout, true)).view;
    }, TX_OPTIONS);
  }

  async update(cart: Cart, input: CheckoutUpdate): Promise<CheckoutView> {
    return this.prisma.$transaction(async (tx) => {
      const checkout = await this.ensure(tx, cart);
      const settings = await this.settings.get(cart.store_id, tx);
      const online = (await this.accounts.enabled(cart.store_id, cart.currency)).map((a) => a.key);
      const market = await this.markets.resolve(cart.store_id, cart.market_id, null, tx);
      const errors: FieldError[] = [];
      const data: Prisma.CheckoutUpdateInput = {};

      if (input.email !== undefined) data.email = input.email;
      if (input.phone !== undefined) data.phone = input.phone;
      if (input.shipping_address !== undefined)
        data.shipping_address = input.shipping_address as unknown as Prisma.InputJsonValue;
      if (input.billing_same_as_shipping === true) data.billing_address = Prisma.DbNull;
      else if (input.billing_address)
        data.billing_address = input.billing_address as unknown as Prisma.InputJsonValue;
      else if (input.billing_same_as_shipping === false)
        errors.push({
          path: "billing_address",
          message: "Enter a billing address.",
          code: "required",
        });
      if (input.terms_accepted !== undefined) data.terms_accepted = input.terms_accepted;

      if (input.custom_fields !== undefined) {
        const r = validateCustomFields(settings.custom_fields, input.custom_fields);
        errors.push(...r.errors.map((e) => ({ ...e, code: "invalid" })));
        data.custom_fields = r.values;
      }
      if (input.payment_method !== undefined) {
        if (
          input.payment_method &&
          (!providerFor(settings, input.payment_method, online, cart.currency) ||
            !this.markets.allowsPayment(market, input.payment_method))
        )
          errors.push({
            path: "payment_method",
            message: "This payment method isn't available.",
            code: "unavailable",
          });
        else data.payment_method = input.payment_method;
      }

      // Shipping choice must be valid for the (possibly new) destination and cart.
      const address = input.shipping_address ?? asAddress(checkout.shipping_address) ?? null;
      const cartView = await this.carts.viewIn(tx, cart);
      const quotes = await this.quotes(tx, cart.store_id, address, cartView, market);
      const wanted =
        input.shipping_method_id !== undefined
          ? input.shipping_method_id
          : checkout.shipping_method_id;
      if (wanted && !quotes.some((q) => q.id === wanted)) {
        if (input.shipping_method_id)
          errors.push({
            path: "shipping_method_id",
            message: "This shipping method isn't available for your address.",
            code: "unavailable",
          });
        data.shipping_method_id = null;
      } else if (input.shipping_method_id !== undefined) {
        data.shipping_method_id = input.shipping_method_id;
      }
      if (input.shipping_address && cartView.requires_shipping) {
        const countries = await this.countriesFor(tx, cart.store_id, market);
        if (countries && !countries.includes(input.shipping_address.country))
          errors.push({
            path: "shipping_address.country",
            message: "We don't ship to this country yet.",
            code: "unavailable",
          });
      }
      if (errors.length) throw AppException.validation(errors);

      const updated = await tx.checkout.update({ where: { id: checkout.id }, data });
      return (await this.build(tx, cart, updated, true)).view;
    }, TX_OPTIONS);
  }

  /** Places the order. Wrapped by the idempotency layer in the controller. */
  async complete(cart: Cart, expectedTotal: number | undefined): Promise<PlacedOrder> {
    const placed = await this.prisma.$transaction(async (tx) => {
      // One completion at a time per checkout.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM checkouts WHERE cart_id = ${cart.id}::uuid FOR UPDATE`;
      const checkout = locked[0]
        ? await tx.checkout.findUniqueOrThrow({ where: { id: locked[0].id } })
        : null;
      if (!checkout) {
        throw new AppException(
          COMMERCE_ERROR_CODES.CHECKOUT_NOT_READY,
          "Start checkout first.",
          HttpStatus.CONFLICT,
        );
      }
      if (checkout.status === "completed") throw this.alreadyCompleted();

      // Freeze the catalog rows we price from until this transaction commits.
      await tx.$executeRaw`
        SELECT 1 FROM product_variants v JOIN cart_lines l ON l.variant_id = v.id
        WHERE l.cart_id = ${cart.id}::uuid FOR SHARE OF v`;

      const built = await this.build(tx, cart, checkout, true);
      const { view, settings, totals, shipping, online, tax, market } = built;
      if (view.missing.length) {
        throw new AppException(
          COMMERCE_ERROR_CODES.CHECKOUT_NOT_READY,
          view.missing.map((m) => MISSING_LABELS[m] ?? m).join(" "),
          HttpStatus.UNPROCESSABLE_ENTITY,
          view.missing.map((m) => ({ path: m, message: MISSING_LABELS[m] ?? m, code: "required" })),
        );
      }
      if (expectedTotal !== undefined && expectedTotal !== totals.total_minor) {
        throw new AppException(
          COMMERCE_ERROR_CODES.CHECKOUT_CHANGED,
          "Your order total changed. Please review it before placing your order.",
          HttpStatus.CONFLICT,
        );
      }
      const provider = providerFor(settings, view.payment_method, online, cart.currency)!;
      const number = await this.nextOrderNumber(tx, cart.store_id);
      const accessKey = generateToken(24);
      const labels = new Map(settings.custom_fields.map((f) => [f.key, f.label]));
      const customerId = await this.linkCustomer(tx, cart, view);
      const order = await tx.order.create({
        data: {
          store_id: cart.store_id,
          customer_id: customerId,
          number,
          currency: cart.currency,
          email: view.email,
          phone: view.phone,
          shipping_address: json(view.shipping_required ? view.shipping_address : null),
          billing_address: json(
            view.billing_same_as_shipping ? view.shipping_address : view.billing_address,
          ),
          shipping_method: shipping
            ? { id: shipping.id, name: shipping.name, price_minor: shipping.price_minor }
            : Prisma.DbNull,
          payment_method: provider.key,
          payment_method_label: provider.label,
          subtotal_minor: BigInt(totals.subtotal_minor),
          discount_minor: BigInt(totals.discount_minor),
          shipping_minor: BigInt(totals.shipping_minor),
          tax_minor: BigInt(totals.tax_minor),
          total_minor: BigInt(totals.total_minor),
          prices_include_tax: totals.prices_include_tax,
          tax_rate_bps: tax.rate_bps,
          tax_label: tax.label,
          market_id: market.id,
          fx_rate: market.store_per_unit,
          store_currency: market.pricing.store_currency,
          store_total_minor: BigInt(toStoreCurrency(totals.total_minor, market.pricing)),
          custom_fields: Object.entries(view.custom_field_values).map(([key, value]) => ({
            key,
            label: labels.get(key) ?? key,
            value,
          })),
          terms_accepted_at: settings.terms_required ? new Date() : null,
          checkout_id: checkout.id,
          access_key_hash: sha256(accessKey),
        },
      });

      // Snapshot each line (price/title/SKU copied now, immutable afterwards).
      const lineTotals = new Map(totals.lines.map((l) => [l.key, l]));
      for (const line of view.cart.lines) {
        const t = lineTotals.get(line.id)!;
        await this.snapshots.addLine(tx, {
          store_id: cart.store_id,
          order_id: order.id,
          variant_id: line.variant_id,
          quantity: line.quantity,
          tax_minor: t.tax_minor,
          discount_minor: t.discount_minor,
        });
      }

      // Stock: the checkout's holds become a sale.
      await this.reservations.consumeIn(tx, checkout.id);
      const tracked = await tx.productVariant.findMany({
        where: { id: { in: view.cart.lines.map((l) => l.variant_id) }, inventory_tracking: true },
        select: { id: true },
      });
      const trackedIds = new Set(tracked.map((t) => t.id));
      for (const line of view.cart.lines) {
        if (!trackedIds.has(line.variant_id)) continue;
        await this.inventory.applyInTx(tx, {
          store_id: cart.store_id,
          variant_id: line.variant_id,
          mode: "delta",
          quantity: -line.quantity,
          type: "sale",
          reason: `Order ${number}`,
          reference: { type: "order", id: order.id },
          actor_id: null,
        });
      }

      const payment = await provider.initiate({
        settings,
        order_id: order.id,
        order_number: number,
        amount_minor: totals.total_minor,
        currency: cart.currency,
      });
      await tx.payment.create({
        data: {
          store_id: cart.store_id,
          order_id: order.id,
          provider: provider.key,
          status: payment.status,
          amount_minor: BigInt(totals.total_minor),
          currency: cart.currency,
          provider_reference: payment.provider_reference,
          instructions: payment.instructions,
        },
      });
      await tx.orderEvent.createMany({
        data: [
          {
            store_id: cart.store_id,
            order_id: order.id,
            type: "order.placed",
            message: `Order placed on the storefront (${view.cart.item_count} ${view.cart.item_count === 1 ? "item" : "items"}).`,
          },
          {
            store_id: cart.store_id,
            order_id: order.id,
            type: "payment.pending",
            message: `Awaiting payment by ${provider.label.toLowerCase()}.`,
          },
        ],
      });
      await this.outbox.emit(tx, {
        store_id: cart.store_id,
        event_type: "order.created",
        resource_type: "order",
        resource_id: order.id,
      });
      await tx.checkout.update({
        where: { id: checkout.id },
        data: { status: "completed", order_id: order.id, reserved_until: null },
      });
      await tx.cart.update({ where: { id: cart.id }, data: { status: "converted" } });

      return {
        order_id: order.id,
        number,
        access_key: accessKey,
        total_minor: totals.total_minor,
        currency: cart.currency,
        pay_online: isOnlineProvider(provider.key),
      };
    }, TX_OPTIONS);
    // Only here, once per order (idempotent replays return the stored response instead).
    await this.mail.confirmation(cart.store_id, placed.order_id, placed.access_key);
    await this.mail.newOrder(cart.store_id, placed.order_id);
    return placed;
  }

  // ───────────── Internals ─────────────

  /**
   * Next 7: every order belongs to a customer — the signed-in one, or the one with
   * this email (created on their first order). Insert-or-ignore keeps concurrent
   * first orders from the same email on one record.
   */
  private async linkCustomer(tx: Tx, cart: Cart, view: CheckoutView): Promise<string | null> {
    if (cart.customer_id) {
      const own = await tx.customer.findFirst({
        where: { id: cart.customer_id, store_id: cart.store_id },
        select: { id: true },
      });
      if (own) return own.id;
    }
    const email = view.email?.trim().toLowerCase();
    if (!email) return null;
    const a = view.shipping_address ?? view.billing_address;
    await tx.$executeRaw`
      INSERT INTO customers (id, store_id, email, first_name, last_name, phone, created_at, updated_at)
      VALUES (gen_random_uuid(), ${cart.store_id}::uuid, ${email}, ${a?.first_name ?? null},
              ${a?.last_name ?? null}, ${view.phone ?? null}, now(), now())
      ON CONFLICT (store_id, email) DO NOTHING`;
    const c = await tx.customer.findUniqueOrThrow({
      where: { store_id_email: { store_id: cart.store_id, email } },
    });
    // Fill in what we didn't know yet; never overwrite what the customer set.
    const patch = {
      ...(!c.first_name && a?.first_name ? { first_name: a.first_name } : {}),
      ...(!c.last_name && a?.last_name ? { last_name: a.last_name } : {}),
      ...(!c.phone && view.phone ? { phone: view.phone } : {}),
    };
    if (Object.keys(patch).length) await tx.customer.update({ where: { id: c.id }, data: patch });
    return c.id;
  }

  private async ensure(tx: Tx, cart: Cart): Promise<Checkout> {
    const existing = await tx.checkout.findUnique({ where: { cart_id: cart.id } });
    if (existing) {
      if (existing.status === "completed") throw this.alreadyCompleted();
      return existing;
    }
    const lines = await tx.cartLine.count({ where: { cart_id: cart.id } });
    if (!lines) {
      throw new AppException(
        COMMERCE_ERROR_CODES.CART_EMPTY,
        "Your cart is empty.",
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    try {
      return await tx.checkout.create({ data: { store_id: cart.store_id, cart_id: cart.id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
        return tx.checkout.findUniqueOrThrow({ where: { cart_id: cart.id } });
      throw err;
    }
  }

  /** Countries this market can check out to: shipping methods ∩ the market's countries. */
  private async countriesFor(
    tx: Tx,
    storeId: string,
    market: ResolvedMarket,
  ): Promise<string[] | null> {
    const byShipping = shippingCountries(
      (await this.settings.shippingMethods(storeId, tx)).map(toShippingConfig),
    );
    const all = await this.markets.activeMarkets(storeId, tx);
    const byMarket = marketCountries(
      {
        id: market.id ?? "",
        countries: market.countries,
        is_primary: market.is_primary,
        active: true,
      },
      all.map((m) => ({
        id: m.id ?? "",
        countries: m.countries,
        is_primary: m.is_primary,
        active: true,
      })),
      COUNTRY_CODES,
    );
    if (!byShipping) return byMarket;
    if (!byMarket) return byShipping;
    return byShipping.filter((c) => byMarket.includes(c));
  }

  private async quotes(
    tx: Tx,
    storeId: string,
    address: { country: string; region?: string | null; city?: string | null } | null | undefined,
    cart: CartView,
    market: ResolvedMarket,
  ): Promise<ShippingOption[]> {
    if (!cart.requires_shipping || !address) return [];
    // Fees and thresholds are set in the store currency; the cart is in the market's.
    const fx = (v: number) => convertAmount(v, market.pricing);
    const fxOpt = (v: number | null | undefined) => (v == null ? v : fx(v));
    const methods = (await this.settings.shippingMethods(storeId, tx))
      .map(toShippingConfig)
      .map((m) => ({
        ...m,
        price_minor: fx(m.price_minor),
        free_over_minor: fxOpt(m.free_over_minor) ?? null,
        min_order_minor: fxOpt(m.min_order_minor),
        max_order_minor: fxOpt(m.max_order_minor),
        per_item_minor: fx(m.per_item_minor ?? 0),
      }));
    const lines = cart.lines.filter((l) => l.requires_shipping);
    const shippable = lines.reduce((a, l) => a + l.line_total_minor, 0);
    const items = lines.reduce((a, l) => a + l.quantity, 0);
    return quoteShipping(methods, address, shippable, items);
  }

  /** Re-validates the cart, refreshes stock holds and recomputes everything. */
  private async build(tx: Tx, cart: Cart, checkout: Checkout, hold: boolean): Promise<Built> {
    const settings = await this.settings.get(cart.store_id, tx);
    // Re-validating the cart can move it back to the primary market, so read it first.
    const cartView = await this.carts.viewIn(tx, cart);
    const market = await this.markets.resolve(cart.store_id, cart.market_id, null, tx);
    const online = (await this.accounts.enabled(cart.store_id, cart.currency)).map((a) => a.key);

    let shortfalls: string[] = [];
    let reservedUntil = checkout.reserved_until;
    if (hold) {
      const tracked = await tx.productVariant.findMany({
        where: {
          id: { in: cartView.lines.map((l) => l.variant_id) },
          inventory_tracking: true,
          continue_selling: false,
        },
        select: { id: true },
      });
      const ids = new Set(tracked.map((t) => t.id));
      const short = await this.reservations.hold(tx, {
        store_id: cart.store_id,
        checkout_id: checkout.id,
        needs: cartView.lines
          .filter((l) => ids.has(l.variant_id) && l.available)
          .map((l) => ({ variant_id: l.variant_id, quantity: l.quantity })),
        minutes: settings.reservation_minutes,
      });
      shortfalls = short.map((s) => s.variant_id);
      reservedUntil = new Date(Date.now() + settings.reservation_minutes * 60_000);
      await tx.checkout.update({
        where: { id: checkout.id },
        data: { reserved_until: reservedUntil },
      });
    }

    const shippingAddress = asAddress(checkout.shipping_address);
    const billingAddress = asAddress(checkout.billing_address);
    const quotes = await this.quotes(tx, cart.store_id, shippingAddress, cartView, market);
    const shipping = cartView.requires_shipping
      ? (quotes.find((q) => q.id === checkout.shipping_method_id) ?? null)
      : null;
    // Taxed where the order goes; billing address when nothing ships.
    const tax = resolveTax(
      settings,
      cartView.requires_shipping ? shippingAddress : (billingAddress ?? shippingAddress),
    );
    const payments = enabledProviders(settings, online, cart.currency).filter((p) =>
      this.markets.allowsPayment(market, p.key),
    );
    const payment = payments.find((p) => p.key === checkout.payment_method) ?? null;
    const totals = computeTotals({
      lines: cartView.lines.map((l) => ({
        key: l.id,
        unit_price_minor: l.unit_price_minor,
        quantity: l.quantity,
        requires_shipping: l.requires_shipping,
      })),
      shipping_minor: shipping?.price_minor ?? 0,
      tax: {
        rate_bps: tax.rate_bps,
        prices_include_tax: settings.prices_include_tax,
        tax_shipping: settings.tax_shipping,
      },
    });
    const customValues = (checkout.custom_fields ?? {}) as Record<string, string | boolean>;
    const customCheck = validateCustomFields(settings.custom_fields, customValues);

    const missing: string[] = [];
    if (!cartView.ready) missing.push("items");
    if (shortfalls.length) missing.push("stock");
    if (!checkout.email) missing.push("email");
    if (settings.phone === "required" && !checkout.phone && !shippingAddress?.phone)
      missing.push("phone");
    if (cartView.requires_shipping) {
      if (!shippingAddress) missing.push("shipping_address");
      else if (!shipping) missing.push("shipping_method");
    } else if (!billingAddress) missing.push("billing_address");
    if (!payment) missing.push("payment_method");
    if (customCheck.errors.length) missing.push("custom_fields");
    if (settings.terms_required && !checkout.terms_accepted) missing.push("terms");

    const view: CheckoutView = {
      id: checkout.id,
      cart: cartView,
      email: checkout.email,
      phone: checkout.phone,
      phone_mode: settings.phone,
      shipping_address: shippingAddress,
      billing_same_as_shipping: cartView.requires_shipping && !billingAddress,
      billing_address: billingAddress,
      shipping_required: cartView.requires_shipping,
      shipping_countries: cartView.requires_shipping
        ? await this.countriesFor(tx, cart.store_id, market)
        : null,
      shipping_options: quotes,
      shipping_method_id: shipping?.id ?? null,
      payment_options: payments.map((p) => p.describe(settings)),
      payment_method: payment?.key ?? null,
      custom_fields: settings.custom_fields,
      custom_field_values: customCheck.values,
      terms: settings.terms_required
        ? { required: true, label: settings.terms_label, url: settings.terms_url }
        : null,
      terms_accepted: checkout.terms_accepted,
      totals: {
        subtotal_minor: totals.subtotal_minor,
        discount_minor: totals.discount_minor,
        shipping_minor: cartView.requires_shipping ? (shipping ? totals.shipping_minor : null) : 0,
        tax_minor: totals.tax_minor,
        total_minor: totals.total_minor,
        prices_include_tax: totals.prices_include_tax,
        tax_label: tax.label,
        tax_rate_bps: tax.rate_bps,
      },
      reserved_until: reservedUntil?.toISOString() ?? null,
      missing,
    };
    return { view, settings, online, totals, shipping, shortfalls, tax, market };
  }

  private async nextOrderNumber(tx: Tx, storeId: string): Promise<string> {
    const rows = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO store_sequences (store_id, name, value) VALUES (${storeId}::uuid, 'order', 1001)
      ON CONFLICT (store_id, name) DO UPDATE SET value = store_sequences.value + 1
      RETURNING value`;
    return String(rows[0]!.value);
  }

  private alreadyCompleted() {
    return new AppException(
      COMMERCE_ERROR_CODES.CHECKOUT_COMPLETED,
      "This order has already been placed.",
      HttpStatus.CONFLICT,
    );
  }
}
