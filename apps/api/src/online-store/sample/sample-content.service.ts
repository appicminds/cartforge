import { Injectable, Logger } from "@nestjs/common";
import type { SampleContentProgress } from "@cartforge/types";
import {
  collectionCreateSchema,
  currencyExponent,
  productCreateSchema,
} from "@cartforge/validation";
import { validateTheme, type ThemeData } from "@cartforge/theme-engine";
import { CollectionsService } from "../../catalog/collections.service";
import { AppException } from "../../common/app-exception";
import { MediaService } from "../../media/media.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ProductsService } from "../../products/products.service";
import { VariantsService } from "../../products/variants.service";
import { ThemesService } from "../themes.service";
import { bannerImage, productImages } from "./art";
import { SAMPLE_KITS, hasSampleContent } from "./kits";
import { NOOR_BANNERS, localPrice, type SampleCollection, type SampleProduct } from "./noor-kit";

export interface SampleActor {
  store_id: string;
  user_id: string;
  can_publish: boolean;
  request_id?: string;
}

/** Products created in one call; the admin calls again until `done`. */
const TIME_BUDGET_MS = 15_000;
/** Lets merchants find (and remove) sample products later. */
export const SAMPLE_TAG = "sample";

/**
 * "Add sample products" for a theme: creates the theme's sample collections and
 * products (with drawn pictures) in the store, then fills the theme's empty
 * banner pictures. Safe to repeat: anything already there (same handle) is
 * skipped, and work is done in short steps to stay within request time limits.
 */
@Injectable()
export class SampleContentService {
  private readonly log = new Logger(SampleContentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly themes: ThemesService,
    private readonly products: ProductsService,
    private readonly variants: VariantsService,
    private readonly collections: CollectionsService,
    private readonly media: MediaService,
  ) {}

  async status(storeId: string, themeId: string): Promise<SampleContentProgress> {
    const theme = await this.theme(storeId, themeId);
    const kit = SAMPLE_KITS[theme.preset]!;
    const existing = await this.existingProducts(storeId, kit.products);
    return {
      done: existing.size === kit.products.length && !this.needsBanners(theme.data),
      products_total: kit.products.length,
      products_added: existing.size,
      collections_total: kit.collections.length,
    };
  }

  async step(themeId: string, actor: SampleActor): Promise<SampleContentProgress> {
    if (!actor.can_publish)
      throw AppException.forbidden(
        "You need permission to publish products to add sample products.",
      );
    const started = Date.now();
    const theme = await this.theme(actor.store_id, themeId);
    const kit = SAMPLE_KITS[theme.preset]!;
    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: actor.store_id },
      select: { currency: true },
    });

    const collectionIds = await this.ensureCollections(kit.collections, actor);
    const existing = await this.existingProducts(actor.store_id, kit.products);
    for (const p of kit.products) {
      if (existing.has(p.handle)) continue;
      if (Date.now() - started > TIME_BUDGET_MS) break;
      await this.createProduct(p, collectionIds, store.currency, actor);
      existing.add(p.handle);
    }

    const allProducts = existing.size === kit.products.length;
    let data = theme.data;
    if (allProducts && this.needsBanners(data) && Date.now() - started < TIME_BUDGET_MS) {
      data = await this.fillBanners(themeId, data, actor);
    }
    return {
      done: allProducts && !this.needsBanners(data),
      products_total: kit.products.length,
      products_added: existing.size,
      collections_total: kit.collections.length,
    };
  }

  // ───────────── Steps ─────────────

  private async theme(storeId: string, id: string) {
    const t = await this.prisma.theme.findFirst({
      where: { id, store_id: storeId },
      select: { preset: true, data: true },
    });
    if (!t) throw AppException.notFound("Theme");
    if (!hasSampleContent(t.preset))
      throw AppException.validation(
        [
          {
            path: "theme",
            message: "This theme doesn't come with sample products.",
            code: "invalid",
          },
        ],
        "This theme doesn't come with sample products.",
      );
    return { preset: t.preset, data: validateTheme(t.data, false).theme };
  }

  private async existingProducts(storeId: string, list: SampleProduct[]) {
    const rows = await this.prisma.product.findMany({
      where: { store_id: storeId, deleted_at: null, handle: { in: list.map((p) => p.handle) } },
      select: { handle: true },
    });
    return new Set(rows.map((r) => r.handle));
  }

  private async ensureCollections(list: SampleCollection[], actor: SampleActor) {
    const rows = await this.prisma.collection.findMany({
      where: { store_id: actor.store_id, handle: { in: list.map((c) => c.handle) } },
      select: { id: true, handle: true },
    });
    const ids = new Map(rows.map((r) => [r.handle, r.id]));
    for (const c of list) {
      if (ids.has(c.handle)) continue;
      const created = await this.collections.create(
        collectionCreateSchema.parse({
          title: c.title,
          handle: c.handle,
          description_html: `<p>${c.description}</p>`,
          status: "active",
          sort_order: "manual",
        }),
        actor,
      );
      ids.set(c.handle, created.id);
    }
    return ids;
  }

  private async createProduct(
    p: SampleProduct,
    collectionIds: Map<string, string>,
    currency: string,
    actor: SampleActor,
  ) {
    const [front, detail] = await productImages(p.look);
    const upload = (buffer: Buffer, name: string, alt: string) =>
      this.media.upload({ buffer, originalname: name }, alt, actor);
    const a = await upload(front, `${p.handle}.png`, p.title);
    const b = await upload(detail, `${p.handle}-detail.png`, `${p.title}, close-up`);
    const minor = (v: number) => Math.round(v * 10 ** currencyExponent(currency));
    const product = await this.products.create(
      productCreateSchema.parse({
        title: p.title,
        handle: p.handle,
        description_html: p.description,
        product_type: "simple",
        status: "active",
        price_minor: minor(localPrice(p.price, currency)),
        compare_at_minor: p.compare_at ? minor(localPrice(p.compare_at, currency)) : null,
        inventory_tracking: false,
        collection_ids: p.collections.map((h) => collectionIds.get(h)!).filter(Boolean),
        tags: [...p.tags, SAMPLE_TAG],
        media: [
          { media_asset_id: a.id, alt_text: p.title },
          { media_asset_id: b.id, alt_text: `${p.title}, close-up` },
        ],
      }),
      actor,
    );
    if (p.options.length) await this.variants.apply(product.id, { options: p.options }, actor);
  }

  /** Slideshow and image-with-text sections that still have no picture. */
  private emptySlots(data: ThemeData) {
    const slots: {
      section: { settings: Record<string, unknown> };
      key: string;
      kind: "slide" | "story";
    }[] = [];
    for (const s of data.templates.home) {
      if (s.type === "slideshow")
        for (const b of s.blocks)
          if (!b.settings.image) slots.push({ section: b, key: "image", kind: "slide" });
      if (s.type === "image_with_text" && !s.settings.image)
        slots.push({ section: s, key: "image", kind: "story" });
    }
    return slots;
  }

  private needsBanners(data: ThemeData) {
    return this.emptySlots(data).length > 0;
  }

  private async fillBanners(themeId: string, data: ThemeData, actor: SampleActor) {
    const next = structuredClone(data);
    const slots = this.emptySlots(next);
    for (const [i, slot] of slots.entries()) {
      const looks = NOOR_BANNERS[slot.kind === "story" ? 2 : i % 2]!;
      const story = slot.kind === "story";
      const image = story
        ? await bannerImage(looks, "light", 1200, 1000)
        : await bannerImage(looks, "dark");
      const asset = await this.media.upload(
        { buffer: image, originalname: `noor-banner-${i + 1}.png` },
        story ? "Abayas and a dress on a clothing rail" : "Abayas on a clothing rail",
        actor,
      );
      slot.section.settings[slot.key] = asset.id;
    }
    await this.themes.save(actor.store_id, themeId, next);
    this.log.log(`Sample banners added to theme ${themeId}`);
    return next;
  }
}
