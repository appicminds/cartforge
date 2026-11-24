import {
  fillSection,
  templateFor,
  type SectionInstance,
  type TemplateKey,
} from "@cartforge/theme-engine";
import { headers } from "next/headers";
import { TEMPLATE_VIEW_HEADER } from "@/lib/site-headers";
import { formatMoney } from "@/lib/money";
import type { ReactNode } from "react";
import { storefront } from "@/lib/api";
import { getTheme } from "@/lib/theme";
import { Hero, ImageBanner, SlideshowSection } from "./banners";
import { FooterSection } from "./footer";
import { BannerSlider, ImageGrid, ImageOnlyBanner } from "./images";
import { AnnouncementBar, HeaderSection } from "./header";
import {
  CategoryList,
  CollectionList,
  FeaturedCollection,
  FeaturedProducts,
  NewArrivals,
  ProductRecommendations,
} from "./products";
import { Shell, type SectionCtx } from "./shared";
import {
  Faq,
  ImageWithText,
  Multicolumn,
  RichTextSection,
  Spacer,
  Testimonials,
  TrustBadges,
  Video,
} from "./text";

type Props = { section: SectionInstance; ctx: SectionCtx };

/** Registered components for each section type (PRD §11.2). */
const COMPONENTS: Record<string, (p: Props) => ReactNode | Promise<ReactNode>> = {
  image_banner: ImageBanner,
  image_only_banner: ImageOnlyBanner,
  banner_slider: BannerSlider,
  image_grid: ImageGrid,
  slideshow: SlideshowSection,
  hero: Hero,
  featured_collection: FeaturedCollection,
  featured_products: FeaturedProducts,
  new_arrivals: NewArrivals,
  collection_list: CollectionList,
  category_list: CategoryList,
  product_recommendations: ProductRecommendations,
  rich_text: RichTextSection,
  image_with_text: ImageWithText,
  multicolumn: Multicolumn,
  trust_badges: TrustBadges,
  testimonials: Testimonials,
  faq: Faq,
  video: Video,
  spacer: Spacer,
  announcement_bar: AnnouncementBar,
  footer: FooterSection,
};

async function baseCtx(extra: Partial<SectionCtx> = {}): Promise<Omit<SectionCtx, "first">> {
  const [store, theme] = await Promise.all([storefront.store(), getTheme()]);
  return { store, theme, ...extra };
}

/**
 * A template's sections in order. The page's own content (product details,
 * product grid, cart…) is the main section: the page passes it as `main`,
 * receiving that section's settings and blocks.
 */
export async function TemplateSections({
  template,
  main,
  product,
  dynamic = {},
  suffix,
}: {
  template: TemplateKey;
  /** Alternate template chosen for this product, collection or page. */
  suffix?: string | null;
  main?: (section: SectionInstance) => ReactNode;
  product?: SectionCtx["product"];
  /** Values for `{{ … }}` placeholders in text settings (collection.title, page.title…). */
  dynamic?: Record<string, string>;
}) {
  const ctx = await baseCtx({ product });
  const values: Record<string, string> = { "store.name": ctx.store.name, ...dynamic };
  if (product) {
    const money = (m: number | null) =>
      m === null ? "" : formatMoney(m, product.currency, ctx.store.locale);
    Object.assign(values, {
      "product.title": product.title,
      "product.vendor": product.vendor ?? "",
      "product.price": money(product.price_min_minor),
      "product.compare_at_price": money(product.compare_at_min_minor),
      "product.category": product.categories[0]?.name ?? "",
    });
  }
  const sections = templateFor(ctx.theme.data, template, await viewOr(suffix))
    .filter((s) => !s.disabled)
    .map((s) => fillSection(s, values));
  return (
    <>
      {sections.map((s, i) => {
        if (s.type.startsWith("main_"))
          return (
            <Shell key={s.id} section={s}>
              {main?.(s)}
            </Shell>
          );
        const C = COMPONENTS[s.type];
        return C ? <C key={s.id} section={s} ctx={{ ...ctx, first: i === 0 }} /> : null;
      })}
    </>
  );
}

/** The header or footer section group. */
export async function GroupSections({
  group,
  cartCount = 0,
}: {
  group: "header" | "footer";
  cartCount?: number;
}) {
  const ctx = { ...(await baseCtx()), first: false };
  const sections = ctx.theme.data.groups[group]
    .filter((s) => !s.disabled)
    .map((s) => fillSection(s, { "store.name": ctx.store.name }));
  return (
    <>
      {sections.map((s) => {
        if (s.type === "header")
          return <HeaderSection key={s.id} section={s} ctx={ctx} cartCount={cartCount} />;
        const C = COMPONENTS[s.type];
        return C ? <C key={s.id} section={s} ctx={ctx} /> : null;
      })}
    </>
  );
}

/** In theme previews, `?view=<name>` (set by middleware) overrides the chosen template. */
async function viewOr(suffix: string | null | undefined): Promise<string | null> {
  return (await headers()).get(TEMPLATE_VIEW_HEADER) ?? suffix ?? null;
}

/** A template's main section (its settings shape the page's own content). */
export async function mainSection(
  template: TemplateKey,
  suffix?: string | null,
): Promise<SectionInstance | undefined> {
  return templateFor((await getTheme()).data, template, await viewOr(suffix)).find((s) =>
    s.type.startsWith("main_"),
  );
}
