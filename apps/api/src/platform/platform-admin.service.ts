import { Injectable } from "@nestjs/common";
import type { Prisma } from "@cartforge/database";
import type { ListResponse, PlatformStoreRow } from "@cartforge/types";
import type { PlatformStoreListQuery, PlatformStoreUpdate } from "@cartforge/validation";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { PrismaService } from "../prisma/prisma.service";

/** Cross-store view for the people who run the platform (P1). */
@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    q: PlatformStoreListQuery,
  ): Promise<Omit<ListResponse<PlatformStoreRow>, "request_id">> {
    const where: Prisma.StoreWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.q && {
        OR: [
          { name: { contains: q.q, mode: "insensitive" as const } },
          { handle: { contains: q.q.toLowerCase() } },
          { domains: { some: { hostname: { contains: q.q.toLowerCase() } } } },
          { memberships: { some: { user: { email: { contains: q.q.toLowerCase() } } } } },
        ],
      }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.store.count({ where }),
      this.prisma.store.findMany({
        where,
        orderBy: [{ created_at: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * q.page_size,
        take: q.page_size,
        include: {
          domains: { where: { is_primary: true } },
          memberships: {
            where: { role: { key: "owner" } },
            include: { user: { select: { email: true } } },
            orderBy: { created_at: "asc" },
            take: 1,
          },
          _count: { select: { products: { where: { deleted_at: null } } } },
        },
      }),
    ]);
    const orderCounts = await this.prisma.order.groupBy({
      by: ["store_id"],
      where: { store_id: { in: rows.map((r) => r.id) } },
      _count: { _all: true },
    });
    const orders = new Map(orderCounts.map((o) => [o.store_id, o._count._all]));
    return {
      data: rows.map((s) => ({
        id: s.id,
        name: s.name,
        handle: s.handle,
        status: s.status,
        plan: s.plan,
        currency: s.currency,
        owner_email: s.memberships[0]?.user.email ?? null,
        primary_domain: s.domains[0]?.hostname ?? null,
        product_count: s._count.products,
        order_count: orders.get(s.id) ?? 0,
        created_at: s.created_at.toISOString(),
        suspended_at: s.suspended_at?.toISOString() ?? null,
        suspension_reason: s.suspension_reason,
      })),
      meta: {
        page: q.page,
        page_size: q.page_size,
        total,
        total_pages: Math.ceil(total / q.page_size),
      },
    };
  }

  async update(
    id: string,
    input: PlatformStoreUpdate,
    actor: { user_id: string; request_id: string },
  ) {
    await this.prisma.$transaction(async (tx) => {
      const s = await tx.store.findUnique({ where: { id } });
      if (!s) throw AppException.notFound("Store");
      await tx.store.update({
        where: { id },
        data:
          input.status === "suspended"
            ? {
                status: "suspended",
                suspended_at: new Date(),
                suspension_reason: input.reason ?? null,
              }
            : { status: "active", suspended_at: null, suspension_reason: null },
      });
      await this.audit.recordIn(tx, {
        action:
          input.status === "suspended" ? "platform.store_suspended" : "platform.store_reactivated",
        resource_type: "store",
        resource_id: id,
        store_id: id,
        actor_user_id: actor.user_id,
        metadata: { reason: input.reason ?? null },
        request_id: actor.request_id,
      });
    });
    return this.prisma.store.findUniqueOrThrow({
      where: { id },
      select: { id: true, status: true },
    });
  }
}
