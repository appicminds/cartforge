import { Injectable, Logger } from "@nestjs/common";
import { formatMoney } from "../common/money";
import { Mailer } from "../mail/mailer";
import { DomainsService } from "../platform/domains.service";
import { PrismaService } from "../prisma/prisma.service";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const itemTitle = (i: { product_title: string; variant_title: string }) =>
  i.variant_title && i.variant_title !== "Default"
    ? `${i.product_title} — ${i.variant_title}`
    : i.product_title;

/**
 * Customer and store emails about orders (Next 6). Sending never fails the action
 * that triggered it: problems are logged, and the order timeline notes what went out.
 */
@Injectable()
export class OrderMailer {
  private readonly logger = new Logger(OrderMailer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
    private readonly domains: DomainsService,
  ) {}

  private async load(storeId: string, orderId: string) {
    const o = await this.prisma.order.findFirst({
      where: { id: orderId, store_id: storeId },
      include: {
        items: { orderBy: { created_at: "asc" } },
        fulfillments: { include: { items: true } },
        refunds: { include: { items: true } },
        payments: { orderBy: { created_at: "asc" } },
      },
    });
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true, locale: true, contact_email: true },
    });
    return o && store ? { o, store } : null;
  }

  private async send(
    storeId: string,
    orderId: string,
    type: string,
    build: (
      ctx: NonNullable<Awaited<ReturnType<OrderMailer["load"]>>>,
    ) =>
      | Promise<{ to: string; subject: string; lines: string[]; replyTo?: string } | null>
      | { to: string; subject: string; lines: string[]; replyTo?: string }
      | null,
  ) {
    try {
      const ctx = await this.load(storeId, orderId);
      if (!ctx) return;
      const msg = await build(ctx);
      if (!msg) return;
      const sent = await this.mailer.send({
        to: msg.to,
        subject: msg.subject,
        text: msg.lines.join("\n"),
        html: msg.lines
          .map((l) =>
            l === ""
              ? ""
              : /^https?:\/\//.test(l)
                ? `<p><a href="${esc(l)}">${esc(l)}</a></p>`
                : `<p>${esc(l)}</p>`,
          )
          .join(""),
        replyTo: msg.replyTo,
      });
      await this.prisma.orderEvent.create({
        data: {
          store_id: storeId,
          order_id: orderId,
          type: "email",
          message: sent
            ? `${type} email sent to ${msg.to}`
            : `${type} email not sent (email isn't set up)`,
          data: { email: type, to: msg.to, sent },
        },
      });
    } catch (err) {
      this.logger.error(`Order email (${type}) failed: ${(err as Error).message}`);
    }
  }

  /** After checkout: the receipt, with the private order-status link. */
  confirmation(storeId: string, orderId: string, accessKey: string) {
    return this.send(storeId, orderId, "Order confirmation", async ({ o, store }) => {
      if (!o.email) return null;
      const money = (v: bigint | number) => formatMoney(v, o.currency, store.locale);
      const link = await this.domains.storefrontLink(
        storeId,
        `/orders/${o.id}?key=${encodeURIComponent(accessKey)}`,
      );
      const payment = o.payments[0];
      return {
        to: o.email,
        replyTo: store.contact_email ?? undefined,
        subject: `Order ${o.number} confirmed — ${store.name}`,
        lines: [
          `Thanks for your order from ${store.name}.`,
          "",
          `Order ${o.number}`,
          ...o.items.map(
            (i) =>
              `${i.quantity} × ${itemTitle(i)} — ${money(i.unit_price_minor * BigInt(i.quantity))}`,
          ),
          `Total: ${money(o.total_minor)}`,
          ...(payment?.instructions ? ["", "How to pay:", payment.instructions] : []),
          "",
          ...(link ? ["Check your order status any time:", link] : []),
        ],
      };
    });
  }

  /** To the store: a new order arrived. */
  newOrder(storeId: string, orderId: string) {
    return this.send(storeId, orderId, "New order", async ({ o, store }) => {
      if (!store.contact_email) return null;
      const money = (v: bigint | number) => formatMoney(v, o.currency, store.locale);
      return {
        to: store.contact_email,
        subject: `New order ${o.number} — ${money(o.total_minor)}`,
        lines: [
          `${store.name} has a new order: ${o.number}${o.email ? ` from ${o.email}` : ""}.`,
          "",
          ...o.items.map((i) => `${i.quantity} × ${itemTitle(i)}`),
          `Total: ${money(o.total_minor)} · payment: ${o.payment_method_label ?? o.payment_method ?? "—"}`,
          "",
          "Open the order in your admin to ship it.",
        ],
      };
    });
  }

  shipped(storeId: string, orderId: string, fulfillmentId: string) {
    return this.send(storeId, orderId, "Shipping confirmation", ({ o, store }) => {
      const f = o.fulfillments.find((x) => x.id === fulfillmentId);
      if (!o.email || !f) return null;
      const items = f.items.map((x) => {
        const i = o.items.find((y) => y.id === x.order_item_id);
        return `${x.quantity} × ${i ? itemTitle(i) : "Item"}`;
      });
      const tracking = [f.tracking_company, f.tracking_number].filter(Boolean).join(" ");
      return {
        to: o.email,
        replyTo: store.contact_email ?? undefined,
        subject: `Your order ${o.number} is on its way`,
        lines: [
          `Good news — items from your ${store.name} order ${o.number} have shipped.`,
          "",
          ...items,
          ...(tracking ? ["", `Tracking: ${tracking}`] : []),
          ...(f.tracking_url ? [f.tracking_url] : []),
        ],
      };
    });
  }

  canceled(storeId: string, orderId: string, refundId: string | null) {
    return this.send(storeId, orderId, "Cancellation", ({ o, store }) => {
      if (!o.email) return null;
      const refund = refundId ? o.refunds.find((r) => r.id === refundId) : null;
      return {
        to: o.email,
        replyTo: store.contact_email ?? undefined,
        subject: `Order ${o.number} canceled`,
        lines: [
          `Your ${store.name} order ${o.number} has been canceled.`,
          ...(refund && refund.amount_minor > 0n
            ? [`We've refunded ${formatMoney(refund.amount_minor, o.currency, store.locale)}.`]
            : []),
          "",
          "Questions? Just reply to this email.",
        ],
      };
    });
  }

  refunded(storeId: string, orderId: string, refundId: string) {
    return this.send(storeId, orderId, "Refund", ({ o, store }) => {
      const r = o.refunds.find((x) => x.id === refundId);
      if (!o.email || !r) return null;
      return {
        to: o.email,
        replyTo: store.contact_email ?? undefined,
        subject: `Refund for order ${o.number}`,
        lines: [
          `We've refunded ${formatMoney(r.amount_minor, o.currency, store.locale)} for your ${store.name} order ${o.number}.`,
          ...r.items.map((x) => {
            const i = o.items.find((y) => y.id === x.order_item_id);
            return `${x.quantity} × ${i ? itemTitle(i) : "Item"}`;
          }),
          "",
          "It can take a few days to show up, depending on how you paid.",
        ],
      };
    });
  }
}
