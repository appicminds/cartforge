import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type Menu } from "@cartforge/database";
import {
  ONLINE_STORE_ERROR_CODES,
  type MenuItem,
  type MenuView,
  type StorefrontMenuItem,
} from "@cartforge/types";
import { slugify, type MenuData } from "@cartforge/validation";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { PrismaService } from "../prisma/prisma.service";

type Actor = { user_id: string; request_id: string };

const notFound = () =>
  new AppException(
    ONLINE_STORE_ERROR_CODES.MENU_NOT_FOUND,
    "Menu not found.",
    HttpStatus.NOT_FOUND,
  );

const asItems = (v: unknown): MenuItem[] => (Array.isArray(v) ? (v as MenuItem[]) : []);

/**
 * Navigation menus. Links point at collections, categories, products and pages
 * by id, so renaming a handle never breaks a menu; the storefront gets the
 * current URLs. Links whose target is gone or hidden are left out.
 */
@Injectable()
export class MenusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(m: Menu): MenuView {
    return {
      id: m.id,
      handle: m.handle,
      title: m.title,
      items: asItems(m.items),
      updated_at: m.updated_at.toISOString(),
    };
  }

  /** Main menu and footer menu, created the first time menus are opened. */
  private async ensureDefaults(storeId: string) {
    if (await this.prisma.menu.count({ where: { store_id: storeId } })) return;
    const top = await this.prisma.category.findMany({
      where: { store_id: storeId, parent_id: null, status: "active" },
      orderBy: { sort_order: "asc" },
      take: 5,
      select: { id: true, name: true },
    });
    const mk = (title: string, link: MenuItem["link"], i: number): MenuItem => ({
      id: `item-${i}`,
      title,
      link,
      children: [],
    });
    const main: MenuItem[] = [
      mk("Shop all", { type: "products" }, 1),
      ...top.map((c, i) => mk(c.name, { type: "category", id: c.id }, i + 2)),
      mk("Collections", { type: "collections" }, 9),
    ];
    const footer: MenuItem[] = [
      mk("Search", { type: "search" }, 1),
      mk("All products", { type: "products" }, 2),
    ];
    await this.prisma.menu.createMany({
      data: [
        {
          store_id: storeId,
          handle: "main-menu",
          title: "Main menu",
          items: main as unknown as Prisma.InputJsonValue,
        },
        {
          store_id: storeId,
          handle: "footer",
          title: "Footer menu",
          items: footer as unknown as Prisma.InputJsonValue,
        },
      ],
      skipDuplicates: true,
    });
  }

  async list(storeId: string): Promise<MenuView[]> {
    await this.ensureDefaults(storeId);
    const rows = await this.prisma.menu.findMany({
      where: { store_id: storeId },
      orderBy: [{ created_at: "asc" }, { handle: "asc" }],
    });
    // The main menu and footer menu first, then the merchant's own.
    const rank = (h: string) => (h === "main-menu" ? 0 : h === "footer" ? 1 : 2);
    return rows.sort((a, b) => rank(a.handle) - rank(b.handle)).map((m) => this.view(m));
  }

  async get(storeId: string, id: string): Promise<MenuView> {
    const m = await this.prisma.menu.findFirst({ where: { id, store_id: storeId } });
    if (!m) throw notFound();
    return this.view(m);
  }

  private taken = (err: unknown): never => {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
      throw AppException.validation([
        { path: "handle", message: "Another menu uses this handle", code: "taken" },
      ]);
    throw err;
  };

  async create(storeId: string, input: MenuData, actor: Actor): Promise<MenuView> {
    const handle = input.handle || slugify(input.title).slice(0, 60) || "menu";
    const m = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.menu.create({
          data: {
            store_id: storeId,
            handle,
            title: input.title,
            items: input.items as unknown as Prisma.InputJsonValue,
          },
        });
        await this.audit.recordIn(tx, {
          action: "menu.created",
          resource_type: "menu",
          resource_id: created.id,
          store_id: storeId,
          actor_user_id: actor.user_id,
          request_id: actor.request_id,
          metadata: { handle },
        });
        return created;
      })
      .catch(this.taken);
    return this.view(m);
  }

  async update(storeId: string, id: string, input: MenuData, actor: Actor): Promise<MenuView> {
    const existing = await this.prisma.menu.findFirst({ where: { id, store_id: storeId } });
    if (!existing) throw notFound();
    const m = await this.prisma
      .$transaction(async (tx) => {
        const updated = await tx.menu.update({
          where: { id },
          data: {
            title: input.title,
            ...(input.handle ? { handle: input.handle } : {}),
            items: input.items as unknown as Prisma.InputJsonValue,
          },
        });
        await this.audit.recordIn(tx, {
          action: "menu.updated",
          resource_type: "menu",
          resource_id: id,
          store_id: storeId,
          actor_user_id: actor.user_id,
          request_id: actor.request_id,
          metadata: { handle: updated.handle },
        });
        return updated;
      })
      .catch(this.taken);
    return this.view(m);
  }

  async remove(storeId: string, id: string, actor: Actor) {
    const existing = await this.prisma.menu.findFirst({ where: { id, store_id: storeId } });
    if (!existing) throw notFound();
    await this.prisma.$transaction(async (tx) => {
      await tx.menu.delete({ where: { id } });
      await this.audit.recordIn(tx, {
        action: "menu.deleted",
        resource_type: "menu",
        resource_id: id,
        store_id: storeId,
        actor_user_id: actor.user_id,
        request_id: actor.request_id,
        metadata: { handle: existing.handle },
      });
    });
  }

  /** The default menus a store without saved menus shows. */
  private async fallback(storeId: string, handle: string): Promise<MenuItem[]> {
    if (handle === "footer")
      return [
        { id: "a", title: "Search", link: { type: "search" }, children: [] },
        { id: "b", title: "All products", link: { type: "products" }, children: [] },
      ];
    if (handle !== "main-menu") return [];
    const top = await this.prisma.category.findMany({
      where: { store_id: storeId, parent_id: null, status: "active" },
      orderBy: { sort_order: "asc" },
      take: 5,
      select: { id: true, name: true },
    });
    return [
      { id: "a", title: "Shop all", link: { type: "products" }, children: [] },
      ...top.map((c) => ({
        id: c.id,
        title: c.name,
        link: { type: "category" as const, id: c.id },
        children: [],
      })),
      { id: "z", title: "Collections", link: { type: "collections" }, children: [] },
    ];
  }

  /** Menus by handle with current URLs, for the storefront. */
  async resolveForStorefront(
    storeId: string,
    handles: string[],
  ): Promise<Record<string, StorefrontMenuItem[]>> {
    if (!handles.length) return {};
    const rows = await this.prisma.menu.findMany({
      where: { store_id: storeId, handle: { in: handles } },
    });
    const byHandle = new Map(rows.map((r) => [r.handle, asItems(r.items)]));
    for (const h of handles) if (!byHandle.has(h)) byHandle.set(h, await this.fallback(storeId, h));

    const ids = {
      collection: new Set<string>(),
      category: new Set<string>(),
      product: new Set<string>(),
      page: new Set<string>(),
      blog: new Set<string>(),
    };
    const collect = (items: MenuItem[]) => {
      for (const i of items) {
        const t = i.link?.type;
        if (t && t in ids && i.link.id) ids[t as keyof typeof ids].add(i.link.id);
        collect(i.children ?? []);
      }
    };
    for (const items of byHandle.values()) collect(items);
    const [collections, categories, products, pages, blogs] = await Promise.all([
      ids.collection.size
        ? this.prisma.collection.findMany({
            where: { store_id: storeId, id: { in: [...ids.collection] }, status: "active" },
            select: { id: true, handle: true },
          })
        : [],
      ids.category.size
        ? this.prisma.category.findMany({
            where: { store_id: storeId, id: { in: [...ids.category] }, status: "active" },
            select: { id: true, handle: true },
          })
        : [],
      ids.product.size
        ? this.prisma.product.findMany({
            where: {
              store_id: storeId,
              id: { in: [...ids.product] },
              status: "active",
              deleted_at: null,
            },
            select: { id: true, handle: true },
          })
        : [],
      ids.page.size
        ? this.prisma.page.findMany({
            where: { store_id: storeId, id: { in: [...ids.page] }, published: true },
            select: { id: true, handle: true },
          })
        : [],
      ids.blog.size
        ? this.prisma.blog.findMany({
            where: { store_id: storeId, id: { in: [...ids.blog] } },
            select: { id: true, handle: true },
          })
        : [],
    ]);
    const path = {
      collection: new Map(collections.map((c) => [c.id, `/collections/${c.handle}`])),
      category: new Map(categories.map((c) => [c.id, `/categories/${c.handle}`])),
      product: new Map(products.map((p) => [p.id, `/products/${p.handle}`])),
      page: new Map(pages.map((p) => [p.id, `/pages/${p.handle}`])),
      blog: new Map(blogs.map((b) => [b.id, `/blogs/${b.handle}`])),
    };
    const fixed: Record<string, string> = {
      home: "/",
      products: "/products",
      collections: "/collections",
      search: "/search",
    };
    const url = (l: MenuItem["link"]): string | null => {
      if (!l) return null;
      if (l.type in fixed) return fixed[l.type]!;
      if (l.type === "url") return l.url ?? null;
      return (l.id && path[l.type as keyof typeof path]?.get(l.id)) || null;
    };
    const map = (items: MenuItem[]): StorefrontMenuItem[] =>
      items.flatMap((i) => {
        const u = url(i.link);
        return u ? [{ title: i.title, url: u, children: map(i.children ?? []) }] : [];
      });
    return Object.fromEntries([...byHandle].map(([h, items]) => [h, map(items)]));
  }
}
