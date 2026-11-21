import { HttpStatus, Injectable } from "@nestjs/common";
import type { Prisma } from "@cartforge/database";
import {
  COMMERCE_ERROR_CODES,
  type CommerceAddress,
  type ListResponse,
  type OrderConfirmation,
  type OrderDetail,
  type OrderListItem,
} from "@cartforge/types";
import type { OrderListQuery } from "@cartforge/validation";
import { safeEqual, sha256 } from "../auth/tokens";
import { AppException } from "../common/app-exception";
import { PrismaService } from "../prisma/prisma.service";
import { isOnlineProvider } from "./payments/registry";

const DETAIL_INCLUDE = {
  items: { orderBy: { created_at: "asc" } },
  events: { orderBy: { created_at: "asc" } },
  payments: { orderBy: { created_at: "asc" } },
  fulfillments: { orderBy: { shipped_at: "asc" }, include: { items: true } },
  refunds: { orderBy: { created_at: "asc" }, include: { items: true } },
} as const satisfies Prisma.OrderInclude;
type Row = Prisma.OrderGetPayload<{ include: typeof DETAIL_INCLUDE }>;

const notFound = () =>
  new AppException(COMMERCE_ERROR_CODES.ORDER_NOT_FOUND, "Order not found.", HttpStatus.NOT_FOUND);
const addr = (v: Prisma.JsonValue | null) => (v ? (v as unknown as CommerceAddress) : null);
const n = (v: bigint) => Number(v);
const itemTitle = (i: { product_title: string; variant_title: string }) =>
  i.variant_title && i.variant_title !== "Default"
    ? `${i.product_title} — ${i.variant_title}`
    : i.product_title;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    storeId: string,
    q: OrderListQuery,
  ): Promise<Omit<ListResponse<OrderListItem>, "request_id">> {
    const term = q.q?.replace(/^#/, "");
    const where: Prisma.OrderWhereInput = {
      store_id: storeId,
      ...(q.status && { status: q.status }),
      ...(q.payment_status && { payment_status: q.payment_status }),
      ...(q.customer_id && { customer_id: q.customer_id }),
      ...(q.to_ship && {
        fulfillment_status: { in: ["unfulfilled", "partially_fulfilled"] },
        canceled_at: null,
      }),
      ...(term && {
        OR: [
          { number: term },
          { email: { contains: term, mode: "insensitive" as const } },
          { items: { some: { product_title: { contains: term, mode: "insensitive" as const } } } },
        ],
      }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: [{ placed_at: "desc" }, { id: "desc" }],
        skip: (q.page - 1) * q.page_size,
        take: q.page_size,
        include: { items: { select: { quantity: true } } },
      }),
    ]);
    return {
      data: rows.map((o) => {
        const a = addr(o.shipping_address) ?? addr(o.billing_address);
        return {
          id: o.id,
          number: o.number,
          placed_at: o.placed_at.toISOString(),
          email: o.email,
          customer_name: a ? [a.first_name, a.last_name].filter(Boolean).join(" ") : null,
          status: o.status,
          payment_status: o.payment_status,
          fulfillment_status: o.fulfillment_status,
          item_count: o.items.reduce((s, i) => s + i.quantity, 0),
          total_minor: n(o.total_minor),
          currency: o.currency,
        };
      }),
      meta: {
        page: q.page,
        page_size: q.page_size,
        total,
        total_pages: Math.ceil(total / q.page_size),
      },
    };
  }

  async detail(storeId: string, id: string): Promise<OrderDetail> {
    const o = await this.prisma.order.findFirst({
      where: { id, store_id: storeId },
      include: DETAIL_INCLUDE,
    });
    if (!o) throw notFound();
    const actorIds = [
      ...o.events.map((e) => e.actor_id),
      ...o.refunds.map((r) => r.created_by),
    ].filter((x): x is string => !!x);
    const names = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: [...new Set(actorIds)] } },
          select: { id: true, name: true },
        })
      ).map((u) => [u.id, u.name]),
    );
    const title = new Map(o.items.map((i) => [i.id, itemTitle(i)]));
    const sumBy = (rows: { order_item_id: string; quantity: number }[]) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(r.order_item_id, (m.get(r.order_item_id) ?? 0) + r.quantity);
      return m;
    };
    const fulfilled = sumBy(o.fulfillments.flatMap((f) => f.items));
    const refunded = sumBy(o.refunds.flatMap((r) => r.items));
    return {
      ...this.confirmation(o),
      cancel_reason: o.cancel_reason,
      line_progress: o.items.map((i) => ({
        order_item_id: i.id,
        fulfilled: fulfilled.get(i.id) ?? 0,
        refunded: refunded.get(i.id) ?? 0,
      })),
      refunds: o.refunds.map((r) => ({
        id: r.id,
        amount_minor: n(r.amount_minor),
        reason: r.reason,
        created_at: r.created_at.toISOString(),
        created_by: r.created_by ? (names.get(r.created_by) ?? null) : null,
        items: r.items.map((x) => ({
          order_item_id: x.order_item_id,
          title: title.get(x.order_item_id) ?? "Item",
          quantity: x.quantity,
          restocked: x.restocked,
        })),
      })),
      phone: o.phone,
      custom_fields: Array.isArray(o.custom_fields)
        ? (o.custom_fields as { key: string; label: string; value: string | boolean }[])
        : [],
      terms_accepted_at: o.terms_accepted_at?.toISOString() ?? null,
      source: o.source,
      events: o.events.map((e) => ({
        id: e.id,
        type: e.type,
        message: e.message,
        at: e.created_at.toISOString(),
        actor: e.actor_id ? (names.get(e.actor_id) ?? null) : null,
      })),
      payments: o.payments.map((p) => ({
        id: p.id,
        provider: p.provider,
        status: p.status,
        amount_minor: n(p.amount_minor),
        created_at: p.created_at.toISOString(),
        mode: p.mode,
        provider_reference: p.provider_reference,
        failure_reason: p.failure_reason,
      })),
    };
  }

  /** Next 7: a signed-in customer's own order (no link key needed). */
  async forAccount(storeId: string, id: string, customerId: string): Promise<OrderConfirmation> {
    const o = await this.prisma.order.findFirst({
      where: { id, store_id: storeId, customer_id: customerId },
      include: DETAIL_INCLUDE,
    });
    if (!o) throw notFound();
    return this.confirmation(o);
  }

  /** Customer view: the secret from the confirmation link is required; wrong keys look like missing orders. */
  async forCustomer(
    storeId: string,
    id: string,
    key: string | undefined,
  ): Promise<OrderConfirmation> {
    if (!key || key.length > 100) throw notFound();
    const o = await this.prisma.order.findFirst({
      where: { id, store_id: storeId },
      include: DETAIL_INCLUDE,
    });
    if (!o?.access_key_hash || !safeEqual(o.access_key_hash, sha256(key))) throw notFound();
    return this.confirmation(o);
  }

  private confirmation(o: Row): OrderConfirmation {
    const payment = o.payments[0];
    const shipping = o.shipping_method as { name: string; price_minor: number } | null;
    return {
      id: o.id,
      number: o.number,
      placed_at: o.placed_at.toISOString(),
      currency: o.currency,
      status: o.status,
      payment_status: o.payment_status,
      fulfillment_status: o.fulfillment_status,
      email: o.email,
      shipping_address: addr(o.shipping_address),
      billing_address: addr(o.billing_address),
      shipping_method: shipping ? { name: shipping.name, price_minor: shipping.price_minor } : null,
      payment: o.payment_method
        ? {
            method: o.payment_method,
            label: o.payment_method_label ?? o.payment_method,
            instructions: payment?.instructions ?? null,
            online: isOnlineProvider(o.payment_method),
            can_pay:
              isOnlineProvider(o.payment_method) && !o.canceled_at && payment?.status === "pending",
            failure_reason: payment?.status === "pending" ? (payment.failure_reason ?? null) : null,
          }
        : null,
      lines: o.items.map((i) => ({
        id: i.id,
        product_id: i.product_id,
        variant_id: i.variant_id,
        product_title: i.product_title,
        variant_title: i.variant_title,
        sku: i.sku,
        options: (i.option_values ?? []) as { option: string; value: string }[],
        quantity: i.quantity,
        unit_price_minor: n(i.unit_price_minor),
        discount_minor: n(i.discount_minor),
        tax_minor: n(i.tax_minor),
        line_total_minor: n(i.unit_price_minor) * i.quantity,
      })),
      fulfillments: o.fulfillments.map((f) => ({
        id: f.id,
        tracking_company: f.tracking_company,
        tracking_number: f.tracking_number,
        tracking_url: f.tracking_url,
        shipped_at: f.shipped_at.toISOString(),
        delivered_at: f.delivered_at?.toISOString() ?? null,
        items: f.items.map((x) => {
          const item = o.items.find((i) => i.id === x.order_item_id);
          return {
            order_item_id: x.order_item_id,
            title: item ? itemTitle(item) : "Item",
            quantity: x.quantity,
          };
        }),
      })),
      canceled_at: o.canceled_at?.toISOString() ?? null,
      refunded_minor: n(o.refunded_minor),
      totals: {
        subtotal_minor: n(o.subtotal_minor),
        discount_minor: n(o.discount_minor),
        shipping_minor: n(o.shipping_minor),
        tax_minor: n(o.tax_minor),
        total_minor: n(o.total_minor),
        prices_include_tax: o.prices_include_tax,
        tax_label: o.tax_label ?? "Tax",
      },
    };
  }
}
