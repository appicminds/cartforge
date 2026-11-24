import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type Article, type Blog } from "@cartforge/database";
import {
  ONLINE_STORE_ERROR_CODES,
  type ArticleImage,
  type ArticleView,
  type BlogView,
  type CatalogImage,
  type StorefrontArticle,
  type StorefrontArticleSummary,
  type StorefrontBlog,
} from "@cartforge/types";
import { slugify, type ArticleData, type BlogData } from "@cartforge/validation";
import { AuditService } from "../audit/audit.service";
import { loadCatalogImages, syncCoverReference } from "../catalog/cover-images";
import { AppException } from "../common/app-exception";
import { sanitizeRichText } from "../common/sanitize-html";
import { MEDIA_RESOURCE } from "../media/media.service";
import { PrismaService } from "../prisma/prisma.service";

type Actor = { user_id: string; request_id: string };
type Tx = Prisma.TransactionClient;

const blogNotFound = () =>
  new AppException(
    ONLINE_STORE_ERROR_CODES.BLOG_NOT_FOUND,
    "Blog not found.",
    HttpStatus.NOT_FOUND,
  );
const articleNotFound = () =>
  new AppException(
    ONLINE_STORE_ERROR_CODES.ARTICLE_NOT_FOUND,
    "Article not found.",
    HttpStatus.NOT_FOUND,
  );

const stripHtml = (html: string) =>
  html
    .replace(/<\/?(p|br|li|ul|ol|h[1-6]|blockquote|pre|hr)\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const toImage = (i: CatalogImage | undefined): ArticleImage | null =>
  i
    ? {
        media_asset_id: i.media_asset_id,
        url: i.url,
        medium_url: i.medium_url,
        large_url: i.large_url,
        alt: i.alt,
        width: i.width,
        height: i.height,
      }
    : null;

/** Blogs and articles (Online store → Blog posts). */
@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private record(
    tx: Tx,
    storeId: string,
    action: string,
    id: string,
    actor: Actor,
    metadata: object,
  ) {
    return this.audit.recordIn(tx, {
      action,
      resource_type: action.split(".")[0]!,
      resource_id: id,
      store_id: storeId,
      actor_user_id: actor.user_id,
      request_id: actor.request_id,
      metadata,
    });
  }

  private taken =
    (path: string) =>
    (err: unknown): never => {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
        throw AppException.validation([
          { path, message: "This handle is already used", code: "taken" },
        ]);
      throw err;
    };

  // ───────────── Blogs ─────────────

  /** A "News" blog is created the first time blogs are listed. */
  async blogs(storeId: string): Promise<BlogView[]> {
    if (!(await this.prisma.blog.count({ where: { store_id: storeId } })))
      await this.prisma.blog
        .create({ data: { store_id: storeId, handle: "news", title: "News" } })
        .catch(() => undefined);
    const rows = await this.prisma.blog.findMany({
      where: { store_id: storeId },
      orderBy: { created_at: "asc" },
      include: { _count: { select: { articles: true } } },
    });
    return rows.map((b) => ({
      id: b.id,
      handle: b.handle,
      title: b.title,
      article_count: b._count.articles,
    }));
  }

  private async blog(storeId: string, id: string): Promise<Blog> {
    const b = await this.prisma.blog.findFirst({ where: { id, store_id: storeId } });
    if (!b) throw blogNotFound();
    return b;
  }

  async createBlog(storeId: string, input: BlogData, actor: Actor): Promise<BlogView> {
    const handle = input.handle || slugify(input.title).slice(0, 255) || "blog";
    const b = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.blog.create({
          data: { store_id: storeId, handle, title: input.title },
        });
        await this.record(tx, storeId, "blog.created", created.id, actor, { handle });
        return created;
      })
      .catch(this.taken("handle"));
    return { id: b.id, handle: b.handle, title: b.title, article_count: 0 };
  }

  async updateBlog(storeId: string, id: string, input: BlogData, actor: Actor): Promise<BlogView> {
    await this.blog(storeId, id);
    const b = await this.prisma
      .$transaction(async (tx) => {
        const updated = await tx.blog.update({
          where: { id },
          data: { title: input.title, ...(input.handle ? { handle: input.handle } : {}) },
          include: { _count: { select: { articles: true } } },
        });
        await this.record(tx, storeId, "blog.updated", id, actor, { handle: updated.handle });
        return updated;
      })
      .catch(this.taken("handle"));
    return { id: b.id, handle: b.handle, title: b.title, article_count: b._count.articles };
  }

  /** Deletes the blog and its articles. */
  async removeBlog(storeId: string, id: string, actor: Actor) {
    const b = await this.blog(storeId, id);
    await this.prisma.$transaction(async (tx) => {
      const ids = (await tx.article.findMany({ where: { blog_id: id }, select: { id: true } })).map(
        (a) => a.id,
      );
      await tx.mediaReference.deleteMany({
        where: {
          store_id: storeId,
          resource_type: MEDIA_RESOURCE.ARTICLE,
          resource_id: { in: ids },
        },
      });
      await tx.blog.delete({ where: { id } });
      await this.record(tx, storeId, "blog.deleted", id, actor, {
        handle: b.handle,
        articles: ids.length,
      });
    });
  }

  // ───────────── Articles ─────────────

  private async views(storeId: string, rows: (Article & { blog: Blog })[]): Promise<ArticleView[]> {
    const images = await loadCatalogImages(
      this.prisma,
      storeId,
      rows.map((a) => a.image_id),
    );
    return rows.map((a) => ({
      id: a.id,
      blog_id: a.blog_id,
      blog_title: a.blog.title,
      blog_handle: a.blog.handle,
      title: a.title,
      handle: a.handle,
      body_html: a.body_html,
      excerpt: a.excerpt,
      image: toImage(a.image_id ? images.get(a.image_id) : undefined),
      author: a.author,
      tags: a.tags,
      published: a.published,
      published_at: a.published_at?.toISOString() ?? null,
      seo_title: a.seo_title,
      seo_description: a.seo_description,
      updated_at: a.updated_at.toISOString(),
    }));
  }

  async articles(storeId: string, q: { blog_id?: string; q?: string }): Promise<ArticleView[]> {
    const rows = await this.prisma.article.findMany({
      where: {
        store_id: storeId,
        ...(q.blog_id ? { blog_id: q.blog_id } : {}),
        ...(q.q ? { title: { contains: q.q, mode: "insensitive" } } : {}),
      },
      include: { blog: true },
      orderBy: [{ published_at: { sort: "desc", nulls: "first" } }, { created_at: "desc" }],
      take: 500,
    });
    return this.views(storeId, rows);
  }

  async article(storeId: string, id: string): Promise<ArticleView> {
    const a = await this.prisma.article.findFirst({
      where: { id, store_id: storeId },
      include: { blog: true },
    });
    if (!a) throw articleNotFound();
    return (await this.views(storeId, [a]))[0]!;
  }

  private async freeHandle(blogId: string, base: string, exceptId?: string) {
    const root = (base || "post").slice(0, 240);
    for (let n = 1; n < 100; n++) {
      const h = n === 1 ? root : `${root}-${n}`;
      const clash = await this.prisma.article.findFirst({
        where: { blog_id: blogId, handle: h, ...(exceptId ? { id: { not: exceptId } } : {}) },
        select: { id: true },
      });
      if (!clash) return h;
    }
    return `${root}-${Date.now().toString(36)}`;
  }

  private async checkImage(storeId: string, imageId: string | null) {
    if (!imageId) return;
    const ok = await this.prisma.mediaAsset.count({
      where: { id: imageId, store_id: storeId, deleted_at: null },
    });
    if (!ok)
      throw AppException.validation([
        { path: "image_id", message: "Choose an image from the library", code: "invalid" },
      ]);
  }

  private data(input: ArticleData, wasPublished: boolean, publishedAt: Date | null) {
    return {
      blog_id: input.blog_id,
      title: input.title,
      body_html: sanitizeRichText(input.body_html),
      excerpt: input.excerpt,
      image_id: input.image_id,
      author: input.author || null,
      tags: [...new Set(input.tags)],
      published: input.published,
      // First publish without a date: now. A date given by the merchant wins.
      published_at:
        input.published_at ??
        (input.published && !wasPublished ? (publishedAt ?? new Date()) : publishedAt),
      seo_title: input.seo_title || null,
      seo_description: input.seo_description || null,
    };
  }

  async createArticle(storeId: string, input: ArticleData, actor: Actor): Promise<ArticleView> {
    await this.blog(storeId, input.blog_id);
    await this.checkImage(storeId, input.image_id);
    const handle = input.handle ?? (await this.freeHandle(input.blog_id, slugify(input.title)));
    const a = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.article.create({
          data: { ...this.data(input, false, null), handle, store_id: storeId },
        });
        await syncCoverReference(tx, storeId, MEDIA_RESOURCE.ARTICLE, created.id, created.image_id);
        await this.record(tx, storeId, "article.created", created.id, actor, { handle });
        return created;
      })
      .catch(this.taken("handle"));
    return this.article(storeId, a.id);
  }

  async updateArticle(
    storeId: string,
    id: string,
    input: ArticleData,
    actor: Actor,
  ): Promise<ArticleView> {
    const existing = await this.prisma.article.findFirst({ where: { id, store_id: storeId } });
    if (!existing) throw articleNotFound();
    await this.blog(storeId, input.blog_id);
    await this.checkImage(storeId, input.image_id);
    await this.prisma
      .$transaction(async (tx) => {
        const updated = await tx.article.update({
          where: { id },
          data: {
            ...this.data(input, existing.published, existing.published_at),
            ...(input.handle ? { handle: input.handle } : {}),
          },
        });
        await syncCoverReference(tx, storeId, MEDIA_RESOURCE.ARTICLE, id, updated.image_id);
        await this.record(tx, storeId, "article.updated", id, actor, { handle: updated.handle });
      })
      .catch(this.taken("handle"));
    return this.article(storeId, id);
  }

  async removeArticle(storeId: string, id: string, actor: Actor) {
    const a = await this.prisma.article.findFirst({ where: { id, store_id: storeId } });
    if (!a) throw articleNotFound();
    await this.prisma.$transaction(async (tx) => {
      await syncCoverReference(tx, storeId, MEDIA_RESOURCE.ARTICLE, id, null);
      await tx.article.delete({ where: { id } });
      await this.record(tx, storeId, "article.deleted", id, actor, { handle: a.handle });
    });
  }

  // ───────────── Storefront ─────────────

  private live = (now = new Date()) => ({ published: true, published_at: { lte: now } });

  private async summaries(
    storeId: string,
    rows: (Article & { blog: Blog })[],
  ): Promise<StorefrontArticleSummary[]> {
    const images = await loadCatalogImages(
      this.prisma,
      storeId,
      rows.map((a) => a.image_id),
    );
    return rows.map((a) => ({
      title: a.title,
      handle: a.handle,
      blog_handle: a.blog.handle,
      excerpt: a.excerpt || stripHtml(a.body_html).slice(0, 200),
      image: toImage(a.image_id ? images.get(a.image_id) : undefined),
      author: a.author,
      tags: a.tags,
      published_at: a.published_at?.toISOString() ?? null,
    }));
  }

  /** A blog's published articles, newest first; drafts too while previewing a theme. */
  async storefrontBlog(
    storeId: string,
    handle: string,
    q: { page: number; page_size: number; tag?: string },
    preview: boolean,
  ): Promise<StorefrontBlog> {
    const blog = await this.prisma.blog.findFirst({ where: { store_id: storeId, handle } });
    if (!blog) throw AppException.notFound("Blog");
    const where: Prisma.ArticleWhereInput = {
      blog_id: blog.id,
      ...(preview ? {} : this.live()),
      ...(q.tag ? { tags: { has: q.tag } } : {}),
    };
    const [total, rows, tagRows] = await Promise.all([
      this.prisma.article.count({ where }),
      this.prisma.article.findMany({
        where,
        include: { blog: true },
        orderBy: [{ published_at: { sort: "desc", nulls: "first" } }, { created_at: "desc" }],
        skip: (q.page - 1) * q.page_size,
        take: q.page_size,
      }),
      this.prisma.article.findMany({
        where: { blog_id: blog.id, ...(preview ? {} : this.live()) },
        select: { tags: true },
        take: 500,
      }),
    ]);
    return {
      handle: blog.handle,
      title: blog.title,
      articles: await this.summaries(storeId, rows),
      meta: {
        page: q.page,
        page_size: q.page_size,
        total,
        total_pages: Math.ceil(total / q.page_size),
      },
      tags: [...new Set(tagRows.flatMap((r) => r.tags))].sort(),
    };
  }

  async storefrontArticle(
    storeId: string,
    blogHandle: string,
    handle: string,
    preview: boolean,
  ): Promise<StorefrontArticle> {
    const a = await this.prisma.article.findFirst({
      where: {
        store_id: storeId,
        handle,
        blog: { handle: blogHandle },
        ...(preview ? {} : this.live()),
      },
      include: { blog: true },
    });
    if (!a) throw AppException.notFound("Article");
    const [summary] = await this.summaries(storeId, [a]);
    return {
      ...summary!,
      body_html: a.body_html,
      blog_title: a.blog.title,
      seo: {
        title: a.seo_title ?? a.title,
        description: a.seo_description ?? (a.excerpt || stripHtml(a.body_html).slice(0, 160)),
      },
      updated_at: a.updated_at.toISOString(),
    };
  }

  /** Blogs with their published articles, for the sitemap. */
  async sitemap(storeId: string) {
    const blogs = await this.prisma.blog.findMany({
      where: { store_id: storeId },
      include: {
        articles: {
          where: this.live(),
          select: { handle: true, updated_at: true },
          orderBy: { published_at: "desc" },
          take: 1000,
        },
      },
    });
    return blogs.map((b) => ({
      handle: b.handle,
      title: b.title,
      updated_at: b.updated_at.toISOString(),
      articles: b.articles.map((a) => ({
        handle: a.handle,
        updated_at: a.updated_at.toISOString(),
      })),
    }));
  }
}
