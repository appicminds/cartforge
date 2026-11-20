import { Injectable } from "@nestjs/common";
import { storeScoped } from "@cartforge/database";
import type { ActorSummary } from "@cartforge/types";
import { AppException } from "../common/app-exception";
import { PrismaService } from "../prisma/prisma.service";

export interface ActivityEntry {
  id: string;
  at: string;
  actor: ActorSummary | null;
  kind: "audit" | "stock";
  action: string;
  summary: string;
}

const FIELD_LABEL: Record<string, string> = {
  title: "title",
  handle: "URL handle",
  vendor: "vendor",
  status: "status",
  taxable: "tax setting",
  description_html: "description",
  seo_title: "SEO title",
  seo_description: "meta description",
  pricing: "pricing",
  media: "images",
  organization: "categories/collections/tags",
  sku: "SKU",
  barcode: "barcode",
  inventory_tracking: "stock tracking",
  continue_selling: "overselling",
  low_stock_threshold: "low-stock alert",
  price_minor: "price",
  compare_at_minor: "compare-at price",
  cost_minor: "cost",
  media_asset_id: "variant image",
  product_type: "product type",
};
const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  draft: "Draft",
  archived: "Archived",
};
const list = (keys: unknown) =>
  Array.isArray(keys)
    ? [...new Set(keys.map((k) => FIELD_LABEL[String(k)] ?? String(k)))].join(", ")
    : "";

/** Human-readable product timeline from the audit log and stock ledger (PRD §8.5). */
@Injectable()
export class ProductActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(storeId: string, productId: string, limit = 50): Promise<ActivityEntry[]> {
    const product = await this.prisma.product.findFirst({
      where: storeScoped(storeId, { id: productId }),
      select: { id: true },
    });
    if (!product) throw AppException.notFound("Product");
    const variants = await this.prisma.productVariant.findMany({
      where: { product_id: productId },
      select: { id: true, title: true },
    });
    const variantTitle = new Map(variants.map((v) => [v.id, v.title]));

    const [audits, moves] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          store_id: storeId,
          OR: [
            { resource_type: "product", resource_id: productId },
            { resource_type: "variant", resource_id: { in: [...variantTitle.keys()] } },
          ],
        },
        orderBy: { created_at: "desc" },
        take: limit,
      }),
      this.prisma.stockMovement.findMany({
        where: { store_id: storeId, variant_id: { in: [...variantTitle.keys()] } },
        orderBy: { created_at: "desc" },
        take: limit,
      }),
    ]);
    const actorIds = [
      ...new Set(
        [...audits.map((a) => a.actor_user_id), ...moves.map((m) => m.actor_id)].filter(
          (x): x is string => Boolean(x),
        ),
      ),
    ];
    const users = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];
    const actor = (id: string | null) => (id && users.find((u) => u.id === id)) || null;

    const entries: ActivityEntry[] = [
      ...audits.map((a) => ({
        id: a.id,
        at: a.created_at.toISOString(),
        actor: actor(a.actor_user_id),
        kind: "audit" as const,
        action: a.action,
        summary: this.describe(
          a.action,
          a.metadata as Record<string, unknown>,
          a.resource_id ? variantTitle.get(a.resource_id) : undefined,
        ),
      })),
      ...moves.map((m) => {
        const t = variantTitle.get(m.variant_id);
        const label = t && t !== "Default" ? ` (${t})` : "";
        const sign = m.quantity_delta > 0 ? `+${m.quantity_delta}` : String(m.quantity_delta);
        return {
          id: m.id,
          at: m.created_at.toISOString(),
          actor: actor(m.actor_id),
          kind: "stock" as const,
          action: `stock.${m.movement_type}`,
          summary: `Stock ${m.movement_type === "initial" ? "set initially" : m.movement_type}${label}: ${sign} (${m.quantity_before} → ${m.quantity_after})`,
        };
      }),
    ];
    return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }

  private describe(action: string, meta: Record<string, unknown>, variant?: string): string {
    const after = (meta.after ?? {}) as Record<string, unknown>;
    switch (true) {
      case action === "product.created":
        return "Created the product";
      case action === "product.duplicated":
        return "Created as a duplicate";
      case action === "product.deleted":
        return "Deleted the product";
      case action.startsWith("product.status."): {
        const others = Array.isArray(meta.changed)
          ? (meta.changed as string[]).filter((c) => c !== "status")
          : [];
        const status = STATUS_LABEL[String(after.status)] ?? String(after.status);
        return `Changed status to ${status}${others.length ? ` and updated ${list(others)}` : ""}`;
      }
      case action === "product.updated":
        return `Updated ${list(meta.changed) || "details"}`;
      case action === "product.variants.updated": {
        const created = Array.isArray(meta.created) ? meta.created.length : 0;
        const removed = Array.isArray(meta.removed) ? meta.removed.length : 0;
        const parts = [created && `${created} created`, removed && `${removed} removed`]
          .filter(Boolean)
          .join(", ");
        return `Changed options${parts ? ` (${parts})` : ""}`;
      }
      case action === "variant.updated":
        return `Updated ${list(meta.changed)}${variant && variant !== "Default" ? ` on ${variant}` : ""}`;
      case action === "variant.bulk_updated":
        return `Bulk-edited ${Array.isArray(meta.variant_ids) ? meta.variant_ids.length : ""} variants`;
      default:
        return action.replace(/[._]/g, " ");
    }
  }
}
