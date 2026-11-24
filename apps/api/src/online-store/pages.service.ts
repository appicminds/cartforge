import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type Page } from "@cartforge/database";
import { ONLINE_STORE_ERROR_CODES, type PageView, type StorefrontPage } from "@cartforge/types";
import { slugify, type PageData } from "@cartforge/validation";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { sanitizeRichText } from "../common/sanitize-html";
import { PrismaService } from "../prisma/prisma.service";

type Actor = { user_id: string; request_id: string };

const notFound = () =>
  new AppException(
    ONLINE_STORE_ERROR_CODES.PAGE_NOT_FOUND,
    "Page not found.",
    HttpStatus.NOT_FOUND,
  );

const stripHtml = (html: string) =>
  html
    .replace(/<\/?(p|br|li|ul|ol|h[1-6]|blockquote|pre|hr)\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Content pages (About us, Contact, policies) shown at /pages/:handle. */
@Injectable()
export class PagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private view(p: Page): PageView {
    return {
      id: p.id,
      title: p.title,
      handle: p.handle,
      body_html: p.body_html,
      seo_title: p.seo_title,
      seo_description: p.seo_description,
      published: p.published,
      updated_at: p.updated_at.toISOString(),
    };
  }

  async list(storeId: string): Promise<PageView[]> {
    const rows = await this.prisma.page.findMany({
      where: { store_id: storeId },
      orderBy: { title: "asc" },
    });
    return rows.map((p) => this.view(p));
  }

  async get(storeId: string, id: string): Promise<PageView> {
    const p = await this.prisma.page.findFirst({ where: { id, store_id: storeId } });
    if (!p) throw notFound();
    return this.view(p);
  }

  private async freeHandle(storeId: string, base: string, exceptId?: string) {
    const root = (base || "page").slice(0, 240);
    for (let n = 1; n < 100; n++) {
      const h = n === 1 ? root : `${root}-${n}`;
      const clash = await this.prisma.page.findFirst({
        where: { store_id: storeId, handle: h, ...(exceptId ? { id: { not: exceptId } } : {}) },
        select: { id: true },
      });
      if (!clash) return h;
    }
    return `${root}-${Date.now().toString(36)}`;
  }

  private taken = (err: unknown): never => {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
      throw AppException.validation([
        { path: "handle", message: "Another page uses this handle", code: "taken" },
      ]);
    throw err;
  };

  private data(input: PageData) {
    return {
      title: input.title,
      body_html: sanitizeRichText(input.body_html),
      seo_title: input.seo_title || null,
      seo_description: input.seo_description || null,
      published: input.published,
    };
  }

  private record(
    tx: Prisma.TransactionClient,
    storeId: string,
    action: string,
    id: string,
    actor: Actor,
    metadata: object,
  ) {
    return this.audit.recordIn(tx, {
      action,
      resource_type: "page",
      resource_id: id,
      store_id: storeId,
      actor_user_id: actor.user_id,
      request_id: actor.request_id,
      metadata,
    });
  }

  async create(storeId: string, input: PageData, actor: Actor): Promise<PageView> {
    const handle = input.handle ?? (await this.freeHandle(storeId, slugify(input.title)));
    const p = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.page.create({
          data: { ...this.data(input), handle, store_id: storeId },
        });
        await this.record(tx, storeId, "page.created", created.id, actor, { handle });
        return created;
      })
      .catch(this.taken);
    return this.view(p);
  }

  async update(storeId: string, id: string, input: PageData, actor: Actor): Promise<PageView> {
    await this.get(storeId, id);
    const p = await this.prisma
      .$transaction(async (tx) => {
        const updated = await tx.page.update({
          where: { id },
          data: { ...this.data(input), ...(input.handle ? { handle: input.handle } : {}) },
        });
        await this.record(tx, storeId, "page.updated", id, actor, { handle: updated.handle });
        return updated;
      })
      .catch(this.taken);
    return this.view(p);
  }

  async remove(storeId: string, id: string, actor: Actor) {
    const p = await this.get(storeId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.page.delete({ where: { id } });
      await this.record(tx, storeId, "page.deleted", id, actor, { handle: p.handle });
    });
  }

  // ───────────── Storefront ─────────────

  private toStorefront(p: Page): StorefrontPage {
    return {
      title: p.title,
      handle: p.handle,
      body_html: p.body_html,
      template_suffix: p.template_suffix,
      seo: {
        title: p.seo_title ?? p.title,
        description: p.seo_description ?? stripHtml(p.body_html).slice(0, 160),
      },
      updated_at: p.updated_at.toISOString(),
    };
  }

  /** A published page (or any page while previewing a theme). */
  async forStorefront(storeId: string, handle: string, preview: boolean): Promise<StorefrontPage> {
    const p = await this.prisma.page.findFirst({
      where: { store_id: storeId, handle, ...(preview ? {} : { published: true }) },
    });
    if (!p) throw AppException.notFound("Page");
    return this.toStorefront(p);
  }

  async publishedList(
    storeId: string,
  ): Promise<{ handle: string; title: string; updated_at: string }[]> {
    const rows = await this.prisma.page.findMany({
      where: { store_id: storeId, published: true },
      orderBy: { title: "asc" },
      select: { handle: true, title: true, updated_at: true },
    });
    return rows.map((r) => ({ ...r, updated_at: r.updated_at.toISOString() }));
  }
}
