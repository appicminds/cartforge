import { HttpStatus, Injectable } from "@nestjs/common";
import type { Prisma } from "@cartforge/database";
import {
  COMMERCE_ERROR_CODES,
  ERROR_CODES,
  type FulfillmentStatus,
  type OrderStatus,
  type PaymentStatus,
} from "@cartforge/types";
import type {
  FulfillmentCreate,
  OrderCancel,
  OrderMarkPaid,
  RefundCreate,
} from "@cartforge/validation";
import { AppException } from "../common/app-exception";
import { formatMoney } from "../common/money";
import { InventoryService } from "../inventory/inventory.service";
import { PrismaService } from "../prisma/prisma.service";
import { OrderMailer } from "./order-mailer";

type Tx = Prisma.TransactionClient;

export interface OrderActor {
  store_id: string;
  user_id: string;
  can_refund: boolean;
  request_id?: string;
}

const ORDER_INCLUDE = {
  items: { orderBy: { created_at: "asc" } },
  payments: { orderBy: { created_at: "asc" } },
  fulfillments: { include: { items: true } },
  refunds: { include: { items: true } },
} as const satisfies Prisma.OrderInclude;
type LockedOrder = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

const state = (message: string, code: string = COMMERCE_ERROR_CODES.ORDER_STATE) =>
  new AppException(code, message, HttpStatus.CONFLICT);
const PAID: PaymentStatus[] = ["paid", "partially_refunded"];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const title = (i: { product_title: string; variant_title: string }) =>
  i.variant_title && i.variant_title !== "Default"
    ? `${i.product_title} — ${i.variant_title}`
    : i.product_title;

/**
 * Order processing (Next 6): payment received, shipping (partial, tracking),
 * delivery, cancellation and refunds. Every action locks the order row, writes
 * the timeline, and re-derives the three statuses from the records.
 * Money is never edited: refunds are separate, append-only rows.
 */
@Injectable()
export class OrderActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly mail: OrderMailer,
  ) {}

  async markPaid(orderId: string, input: OrderMarkPaid, actor: OrderActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const o = await this.lock(tx, actor.store_id, orderId);
      if (o.canceled_at) throw state("This order is canceled.");
      if (o.payment_status !== "pending" && o.payment_status !== "authorized")
        throw state("This order's payment is already recorded.");
      const payment = o.payments[0];
      if (payment)
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "paid",
            ...(input.reference ? { provider_reference: input.reference } : {}),
          },
        });
      await this.event(
        tx,
        o,
        actor,
        "payment_received",
        `Payment received${input.reference ? ` (reference ${input.reference})` : ""}`,
        {
          reference: input.reference ?? null,
        },
      );
      await this.settle(tx, o.id, { payment_status: "paid" });
    });
  }

  async fulfill(orderId: string, input: FulfillmentCreate, actor: OrderActor): Promise<string> {
    const { fulfillmentId, notify } = await this.prisma.$transaction(async (tx) => {
      const o = await this.lock(tx, actor.store_id, orderId);
      if (o.canceled_at) throw state("This order is canceled.");
      const remaining = this.remainingToShip(o);
      const wanted =
        input.items ??
        [...remaining.entries()]
          .filter(([, q]) => q > 0)
          .map(([order_item_id, quantity]) => ({ order_item_id, quantity }));
      if (!wanted.length) throw state("Everything in this order has already been shipped.");
      for (const [i, w] of wanted.entries()) {
        const left = remaining.get(w.order_item_id);
        if (left === undefined) throw AppException.notFound("Order item");
        if (w.quantity > left)
          throw new AppException(
            COMMERCE_ERROR_CODES.QUANTITY_TOO_HIGH,
            `Only ${left} left to ship for this item.`,
            HttpStatus.UNPROCESSABLE_ENTITY,
            [
              {
                path: `items.${i}.quantity`,
                message: `Only ${left} left to ship`,
                code: "too_high",
              },
            ],
          );
      }
      const f = await tx.fulfillment.create({
        data: {
          store_id: o.store_id,
          order_id: o.id,
          tracking_company: input.tracking_company ?? null,
          tracking_number: input.tracking_number ?? null,
          tracking_url: input.tracking_url ?? null,
          created_by: actor.user_id,
          items: {
            create: wanted.map((w) => ({ order_item_id: w.order_item_id, quantity: w.quantity })),
          },
        },
      });
      const count = wanted.reduce((s, w) => s + w.quantity, 0);
      const tracking = [input.tracking_company, input.tracking_number].filter(Boolean).join(" ");
      await this.event(
        tx,
        o,
        actor,
        "fulfilled",
        `Shipped ${plural(count, "item")}${tracking ? ` (${tracking})` : ""}`,
        {
          fulfillment_id: f.id,
        },
      );
      await this.settle(tx, o.id);
      return { fulfillmentId: f.id, notify: input.notify_customer };
    });
    if (notify) await this.mail.shipped(actor.store_id, orderId, fulfillmentId);
    return fulfillmentId;
  }

  async markDelivered(orderId: string, fulfillmentId: string, actor: OrderActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const o = await this.lock(tx, actor.store_id, orderId);
      const f = o.fulfillments.find((x) => x.id === fulfillmentId);
      if (!f) throw AppException.notFound("Shipment");
      if (f.delivered_at) throw state("This shipment is already marked as delivered.");
      await tx.fulfillment.update({ where: { id: f.id }, data: { delivered_at: new Date() } });
      await this.event(tx, o, actor, "delivered", "Shipment delivered", { fulfillment_id: f.id });
    });
  }

  async cancel(orderId: string, input: OrderCancel, actor: OrderActor): Promise<void> {
    const refundId = await this.prisma.$transaction(async (tx) => {
      const o = await this.lock(tx, actor.store_id, orderId);
      if (o.canceled_at) throw state("This order is already canceled.");
      if (o.fulfillments.length)
        throw state("Shipped orders can't be canceled. Refund the items instead.");
      const paid = PAID.includes(o.payment_status);
      if (paid && !input.refund)
        throw state(
          "This order is paid. Cancel it with a refund, so the customer gets their money back.",
          COMMERCE_ERROR_CODES.ORDER_PAID,
        );
      if (paid && !actor.can_refund)
        throw new AppException(
          ERROR_CODES.FORBIDDEN,
          "You don't have permission to refund orders.",
          HttpStatus.FORBIDDEN,
        );

      let refund: string | null = null;
      const refundedQty = this.refundedQty(o);
      const open = o.items
        .map((i) => ({ item: i, quantity: i.quantity - (refundedQty.get(i.id) ?? 0) }))
        .filter((x) => x.quantity > 0);
      if (paid) {
        refund = await this.recordRefund(tx, o, actor, {
          items: open.map((x) => ({
            order_item_id: x.item.id,
            quantity: x.quantity,
            restock: input.restock,
          })),
          amount_minor: Number(o.total_minor - o.refunded_minor),
          reason: `Order canceled (${input.reason})`,
          notify_customer: false,
        });
      } else if (input.restock) {
        for (const x of open)
          await this.restock(tx, o, x.item, x.quantity, actor, "Order canceled");
      }
      await tx.order.update({
        where: { id: o.id },
        data: { canceled_at: new Date(), cancel_reason: input.reason },
      });
      const payment = o.payments[0];
      if (payment && !paid && payment.status === "pending")
        await tx.payment.update({ where: { id: payment.id }, data: { status: "voided" } });
      await this.event(
        tx,
        o,
        actor,
        "canceled",
        `Order canceled (${input.reason})${input.restock ? "; items restocked" : ""}`,
        {
          reason: input.reason,
          restock: input.restock,
        },
      );
      await this.settle(tx, o.id, paid ? {} : { payment_status: "voided" });
      return refund;
    });
    if (input.notify_customer) await this.mail.canceled(actor.store_id, orderId, refundId);
  }

  async refund(orderId: string, input: RefundCreate, actor: OrderActor): Promise<string> {
    const refundId = await this.prisma.$transaction(async (tx) => {
      const o = await this.lock(tx, actor.store_id, orderId);
      if (!PAID.includes(o.payment_status))
        throw state(
          "Only paid orders can be refunded. Record the payment first, or cancel the order.",
        );
      const id = await this.recordRefund(tx, o, actor, input);
      await this.settle(tx, o.id);
      return id;
    });
    if (input.notify_customer) await this.mail.refunded(actor.store_id, orderId, refundId);
    return refundId;
  }

  async addNote(orderId: string, message: string, actor: OrderActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const o = await this.lock(tx, actor.store_id, orderId);
      await this.event(tx, o, actor, "note", message, {});
    });
  }

  // ───────────── Internals ─────────────

  private async lock(tx: Tx, storeId: string, id: string): Promise<LockedOrder> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM orders WHERE id = ${id}::uuid AND store_id = ${storeId}::uuid FOR UPDATE`;
    if (!rows.length)
      throw new AppException(
        COMMERCE_ERROR_CODES.ORDER_NOT_FOUND,
        "Order not found.",
        HttpStatus.NOT_FOUND,
      );
    return tx.order.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE });
  }

  private refundedQty(o: LockedOrder): Map<string, number> {
    const m = new Map<string, number>();
    for (const r of o.refunds)
      for (const x of r.items) m.set(x.order_item_id, (m.get(x.order_item_id) ?? 0) + x.quantity);
    return m;
  }

  /** Per item: ordered − refunded − already shipped. */
  private remainingToShip(o: LockedOrder): Map<string, number> {
    const shipped = new Map<string, number>();
    for (const f of o.fulfillments)
      for (const x of f.items)
        shipped.set(x.order_item_id, (shipped.get(x.order_item_id) ?? 0) + x.quantity);
    const refunded = this.refundedQty(o);
    return new Map(
      o.items.map((i) => [
        i.id,
        Math.max(0, i.quantity - (refunded.get(i.id) ?? 0) - (shipped.get(i.id) ?? 0)),
      ]),
    );
  }

  private async recordRefund(
    tx: Tx,
    o: LockedOrder,
    actor: OrderActor,
    input: RefundCreate,
  ): Promise<string> {
    if (!actor.can_refund)
      throw new AppException(
        ERROR_CODES.FORBIDDEN,
        "You don't have permission to refund orders.",
        HttpStatus.FORBIDDEN,
      );
    const refundable = Number(o.total_minor - o.refunded_minor);
    if (input.amount_minor > refundable)
      throw new AppException(
        COMMERCE_ERROR_CODES.REFUND_TOO_HIGH,
        `You can refund at most ${formatMoney(refundable, o.currency)}.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        [{ path: "amount_minor", message: "More than what's left to refund", code: "too_high" }],
      );
    const refunded = this.refundedQty(o);
    for (const [i, line] of input.items.entries()) {
      const item = o.items.find((x) => x.id === line.order_item_id);
      if (!item) throw AppException.notFound("Order item");
      const left = item.quantity - (refunded.get(item.id) ?? 0);
      if (line.quantity > left)
        throw new AppException(
          COMMERCE_ERROR_CODES.QUANTITY_TOO_HIGH,
          `Only ${left} of “${title(item)}” left to refund.`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          [
            {
              path: `items.${i}.quantity`,
              message: `Only ${left} left to refund`,
              code: "too_high",
            },
          ],
        );
    }
    const r = await tx.refund.create({
      data: {
        store_id: o.store_id,
        order_id: o.id,
        amount_minor: BigInt(input.amount_minor),
        currency: o.currency,
        reason: input.reason ?? null,
        created_by: actor.user_id,
        items: {
          create: input.items.map((l) => ({
            order_item_id: l.order_item_id,
            quantity: l.quantity,
            restocked: l.restock,
          })),
        },
      },
    });
    for (const l of input.items)
      if (l.restock) {
        const item = o.items.find((x) => x.id === l.order_item_id)!;
        await this.restock(tx, o, item, l.quantity, actor, "Refund");
      }
    const total = o.refunded_minor + BigInt(input.amount_minor);
    await tx.order.update({ where: { id: o.id }, data: { refunded_minor: total } });
    const full = total >= o.total_minor && o.total_minor > 0n;
    const payment = o.payments[0];
    if (payment && input.amount_minor > 0)
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: full ? "refunded" : "partially_refunded" },
      });
    const qty = input.items.reduce((s, l) => s + l.quantity, 0);
    await this.event(
      tx,
      o,
      actor,
      "refunded",
      `Refunded ${formatMoney(input.amount_minor, o.currency)}${qty ? ` for ${plural(qty, "item")}` : ""}${input.reason ? ` — ${input.reason}` : ""}`,
      { refund_id: r.id, amount_minor: input.amount_minor },
    );
    return r.id;
  }

  /** Puts stock back for tracked, still-existing variants (others are skipped silently). */
  private async restock(
    tx: Tx,
    o: LockedOrder,
    item: LockedOrder["items"][number],
    quantity: number,
    actor: OrderActor,
    why: string,
  ) {
    if (!item.variant_id || quantity <= 0) return;
    const v = await tx.productVariant.findFirst({
      where: {
        id: item.variant_id,
        store_id: o.store_id,
        deleted_at: null,
        inventory_tracking: true,
      },
      select: { id: true },
    });
    if (!v) return;
    await this.inventory.applyInTx(tx, {
      store_id: o.store_id,
      variant_id: v.id,
      mode: "delta",
      quantity,
      type: "returned",
      reason: `${why}: order ${o.number}`,
      reference: { type: "order", id: o.id },
      actor_id: actor.user_id,
      request_id: actor.request_id,
    });
  }

  /** Re-derives payment, fulfillment and order status from the records. */
  private async settle(tx: Tx, orderId: string, patch: { payment_status?: PaymentStatus } = {}) {
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
    const refunded = this.refundedQty(o);
    const shipped = new Map<string, number>();
    for (const f of o.fulfillments)
      for (const x of f.items)
        shipped.set(x.order_item_id, (shipped.get(x.order_item_id) ?? 0) + x.quantity);
    const anyShipped = [...shipped.values()].some((q) => q > 0);
    const allShipped = o.items.every(
      (i) => (shipped.get(i.id) ?? 0) >= i.quantity - (refunded.get(i.id) ?? 0),
    );
    const fulfillment: FulfillmentStatus = !anyShipped
      ? "unfulfilled"
      : allShipped
        ? "fulfilled"
        : "partially_fulfilled";

    let payment: PaymentStatus = patch.payment_status ?? o.payment_status;
    if (o.refunded_minor > 0n)
      payment = o.refunded_minor >= o.total_minor ? "refunded" : "partially_refunded";

    const paidish = PAID.includes(payment);
    const status: OrderStatus = o.canceled_at
      ? "canceled"
      : payment === "refunded"
        ? "refunded"
        : paidish && fulfillment === "fulfilled"
          ? "completed"
          : paidish || fulfillment !== "unfulfilled"
            ? "processing"
            : "pending";

    await tx.order.update({
      where: { id: o.id },
      data: { status, payment_status: payment, fulfillment_status: fulfillment },
    });
  }

  private event(
    tx: Tx,
    o: { id: string; store_id: string },
    actor: OrderActor,
    type: string,
    message: string,
    data: Prisma.InputJsonValue,
  ) {
    return tx.orderEvent.create({
      data: {
        store_id: o.store_id,
        order_id: o.id,
        type,
        message: message.slice(0, 500),
        data,
        actor_id: actor.user_id,
      },
    });
  }
}
