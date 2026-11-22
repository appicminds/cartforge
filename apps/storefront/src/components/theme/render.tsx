import type { SectionInstance, TemplateKey } from "@cartforge/theme-engine";
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
}: {
  template: TemplateKey;
  main?: (section: SectionInstance) => ReactNode;
  product?: SectionCtx["product"];
}) {
  const ctx = await baseCtx({ product });
  const sections = ctx.theme.data.templates[template].filter((s) => !s.disabled);
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
  const sections = ctx.theme.data.groups[group].filter((s) => !s.disabled);
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

/** A main section's settings, for pages that render outside a template (fallbacks). */
export async function mainSection(template: TemplateKey): Promise<SectionInstance | undefined> {
  return (await getTheme()).data.templates[template].find((s) => s.type.startsWith("main_"));
}
