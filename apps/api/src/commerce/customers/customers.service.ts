import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@cartforge/database";
import {
  CUSTOMER_ERROR_CODES,
  type CommerceAddress,
  type CustomerDetail,
  type CustomerListItem,
  type ListResponse,
} from "@cartforge/types";
import type { CustomerListQuery, CustomerUpdate } from "@cartforge/validation";
import { AuditService } from "../../audit/audit.service";
import { AppException } from "../../common/app-exception";
import { PrismaService } from "../../prisma/prisma.service";
import { OrdersService } from "../orders.service";

export const customerNotFound = () =>
  new AppException(
    CUSTOMER_ERROR_CODES.CUSTOMER_NOT_FOUND,
    "Customer not found.",
    HttpStatus.NOT_FOUND,
  );

const fullName = (c: { first_name: string | null; last_name: string | null }) =>
  [c.first_name, c.last_name].filter(Boolean).join(" ") || null;

interface Stats {
  orders_count: number;
  total_spent_minor: number;
  last_order_at: string | null;
}

/** Admin view of a store's customers (Next 7). */
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orders: OrdersService,
  ) {}

  /**
   * Orders count, money spent (paid minus refunded, canceled excluded) in the store's
   * currency (orders from other markets count at their recorded rate), last order.
   */
  private async stats(storeId: string, ids: string[]): Promise<Map<string, Stats>> {
    if (!ids.length) return new Map();
    const rows = await this.prisma.$queryRaw<
      { customer_id: string; n: bigint; spent: bigint | null; last: Date | null }[]
    >`
      SELECT customer_id, count(*)::bigint AS n,
             sum(CASE WHEN canceled_at IS NULL AND payment_status IN ('paid','partially_refunded','refunded')
                      THEN ROUND(COALESCE(store_total_minor, total_minor)::numeric * (total_minor - refunded_minor) / NULLIF(total_minor, 0)) ELSE 0 END)::bigint AS spent,
             max(placed_at) AS last
      FROM orders
      WHERE store_id = ${storeId}::uuid AND customer_id = ANY(${ids}::uuid[])
      GROUP BY customer_id`;
    return new Map(
      rows.map((r) => [
        r.customer_id,
        {
          orders_count: Number(r.n),
          total_spent_minor: Number(r.spent ?? 0n),
          last_order_at: r.last?.toISOString() ?? null,
        },
      ]),
    );
  }

  private item(
    c: Prisma.CustomerGetPayload<object>,
    s: Stats | undefined,
    currency: string,
  ): CustomerListItem {
    return {
      id: c.id,
      email: c.email,
      name: fullName(c),
      phone: c.phone,
      has_account: !!c.password_hash,
      accepts_marketing: c.accepts_marketing,
      tags: c.tags,
      orders_count: s?.orders_count ?? 0,
      total_spent_minor: s?.total_spent_minor ?? 0,
      currency,
      last_order_at: s?.last_order_at ?? null,
      created_at: c.created_at.toISOString(),
    };
  }

  async list(
    storeId: string,
    q: CustomerListQuery,
  ): Promise<Omit<ListResponse<CustomerListItem>, "request_id">> {
    const term = q.q;
    const where: Prisma.CustomerWhereInput = {
      store_id: storeId,
      ...(term && {
        OR: [
          { email: { contains: term, mode: "insensitive" as const } },
          { first_name: { contains: term, mode: "insensitive" as const } },
          { last_name: { contains: term, mode: "insensitive" as const } },
          { phone: { contains: term } },
          { tags: { has: term } },
        ],
      }),
    };
    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { currency: true },
    });
    const total = await this.prisma.customer.count({ where });
    let rows: Prisma.CustomerGetPayload<object>[];
    if (q.sort === "created_at") {
      rows = await this.prisma.customer.findMany({
        where,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        skip: (q.page - 1) * q.page_size,
        take: q.page_size,
      });
    } else {
      // Sort by an order statistic: rank ids in SQL, then load that page.
      const like = term ? `%${term}%` : null;
      const order =
        q.sort === "last_order_at"
          ? Prisma.sql`max(o.placed_at) DESC NULLS LAST`
          : Prisma.sql`coalesce(sum(CASE WHEN o.canceled_at IS NULL
                AND o.payment_status IN ('paid','partially_refunded','refunded')
                THEN ROUND(COALESCE(o.store_total_minor, o.total_minor)::numeric * (o.total_minor - o.refunded_minor) / NULLIF(o.total_minor, 0)) ELSE 0 END), 0) DESC`;
      const ids = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT c.id FROM customers c
        LEFT JOIN orders o ON o.customer_id = c.id
        WHERE c.store_id = ${storeId}::uuid
          AND (${like}::text IS NULL OR c.email ILIKE ${like} OR c.first_name ILIKE ${like}
               OR c.last_name ILIKE ${like} OR c.phone ILIKE ${like} OR ${term ?? ""} = ANY(c.tags))
        GROUP BY c.id
        ORDER BY ${order}, c.id
        OFFSET ${(q.page - 1) * q.page_size} LIMIT ${q.page_size}`;
      const byId = new Map(
        (await this.prisma.customer.findMany({ where: { id: { in: ids.map((r) => r.id) } } })).map(
          (c) => [c.id, c],
        ),
      );
      rows = ids.map((r) => byId.get(r.id)!).filter(Boolean);
    }
    const stats = await this.stats(
      storeId,
      rows.map((r) => r.id),
    );
    return {
      data: rows.map((c) => this.item(c, stats.get(c.id), store.currency)),
      meta: {
        page: q.page,
        page_size: q.page_size,
        total,
        total_pages: Math.ceil(total / q.page_size),
      },
    };
  }

  async detail(storeId: string, id: string): Promise<CustomerDetail> {
    const c = await this.prisma.customer.findFirst({
      where: { id, store_id: storeId },
      include: { addresses: { orderBy: [{ is_default: "desc" }, { created_at: "asc" }] } },
    });
    if (!c) throw customerNotFound();
    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { currency: true },
    });
    const [stats, orders] = await Promise.all([
      this.stats(storeId, [c.id]),
      this.orders.list(storeId, {
        page: 1,
        page_size: 50,
        q: undefined,
        customer_id: c.id,
        to_ship: false,
      }),
    ]);
    return {
      ...this.item(c, stats.get(c.id), store.currency),
      first_name: c.first_name,
      last_name: c.last_name,
      note: c.note,
      addresses: c.addresses.map((a) => ({
        id: a.id,
        address: a.address as unknown as CommerceAddress,
        is_default: a.is_default,
      })),
      orders: orders.data,
    };
  }

  async update(
    storeId: string,
    id: string,
    input: CustomerUpdate,
    actor: { user_id: string; request_id?: string },
  ): Promise<CustomerDetail> {
    const c = await this.prisma.customer.findFirst({
      where: { id, store_id: storeId },
      select: { id: true },
    });
    if (!c) throw customerNotFound();
    await this.prisma.customer.update({ where: { id }, data: input });
    await this.audit.record({
      action: "customer.updated",
      resource_type: "customer",
      resource_id: id,
      store_id: storeId,
      actor_user_id: actor.user_id,
      metadata: { fields: Object.keys(input).join(",") },
      request_id: actor.request_id,
    });
    return this.detail(storeId, id);
  }
}
