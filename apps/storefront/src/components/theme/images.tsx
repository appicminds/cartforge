import type { SectionInstance } from "@cartforge/theme-engine";
import type { ThemeImage } from "@cartforge/types";
import { ImageSlider } from "./image-slider";
import {
  bool,
  LG_COLS,
  num,
  SectionHeading,
  Shell,
  str,
  ThemeImg,
  ThemeLink,
  type SectionCtx,
} from "./shared";

const src = (i: ThemeImage) => i.large_url ?? i.url;

/**
 * A whole picture (never cropped), with an optional taller one for phones.
 * Used by image-only banners where the text is part of the image.
 */
function Picture({
  ctx,
  image,
  mobile,
  alt,
  eager,
  className = "",
}: {
  ctx: SectionCtx;
  image: unknown;
  mobile: unknown;
  alt: string;
  eager: boolean;
  className?: string;
}) {
  const img = typeof image === "string" ? ctx.theme.images[image] : undefined;
  const mob = typeof mobile === "string" ? ctx.theme.images[mobile] : undefined;
  if (!img && !mob)
    return (
      <ThemeImg ctx={ctx} id={null} sizes="100vw" className={`aspect-[16/6] w-full ${className}`} />
    );
  const main = (img ?? mob)!;
  return (
    <picture>
      {img && mob && <source media="(max-width: 767px)" srcSet={src(mob)} />}
      <img
        src={src(main)}
        alt={alt || main.alt || ""}
        width={main.width ?? undefined}
        height={main.height ?? undefined}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        decoding="async"
        className={`block h-auto w-full ${className}`}
      />
    </picture>
  );
}

const Linked = ({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) =>
  href ? (
    <ThemeLink href={href} className="block" aria-label={label || undefined}>
      {children}
    </ThemeLink>
  ) : (
    <>{children}</>
  );

export function ImageOnlyBanner({ section, ctx }: { section: SectionInstance; ctx: SectionCtx }) {
  const s = section.settings;
  const contained = str(s, "width") === "contained";
  const round = bool(s, "rounded") ? "rounded-[var(--sf-card-radius)] overflow-hidden" : "";
  return (
    <Shell section={section} as="section" label={str(s, "alt") || "Banner"}>
      <div
        className={`${contained ? "sf-container" : ""} ${bool(s, "spacing") ? "py-8 md:py-12" : ""}`}
      >
        <div className={round}>
          <Linked href={str(s, "link")} label={str(s, "alt")}>
            <Picture
              ctx={ctx}
              image={s.image}
              mobile={s.mobile_image}
              alt={str(s, "alt")}
              eager={ctx.first}
            />
          </Linked>
        </div>
      </div>
    </Shell>
  );
}

export function BannerSlider({ section, ctx }: { section: SectionInstance; ctx: SectionCtx }) {
  const s = section.settings;
  const banners = section.blocks.filter((b) => !b.disabled);
  if (!banners.length) return null;
  const contained = str(s, "width") === "contained";
  return (
    <Shell section={section} as="section" label="Banners">
      <div className={contained ? "sf-container py-6" : ""}>
        <ImageSlider
          autoplay={bool(s, "autoplay")}
          seconds={num(s, "speed", 5)}
          rounded={bool(s, "rounded")}
          slides={banners.map((b, i) => (
            <div key={b.id} data-cf-block={b.id}>
              <Linked href={str(b.settings, "link")} label={str(b.settings, "alt")}>
                <Picture
                  ctx={ctx}
                  image={b.settings.image}
                  mobile={b.settings.mobile_image}
                  alt={str(b.settings, "alt")}
                  eager={ctx.first && i === 0}
                />
              </Linked>
            </div>
          ))}
        />
      </div>
    </Shell>
  );
}

const GAP: Record<string, string> = {
  none: "gap-0",
  small: "gap-3 md:gap-4",
  large: "gap-6 md:gap-8",
};

export function ImageGrid({ section, ctx }: { section: SectionInstance; ctx: SectionCtx }) {
  const s = section.settings;
  const items = section.blocks.filter((b) => !b.disabled);
  if (!items.length) return null;
  const cols = Math.min(4, Math.max(1, num(s, "columns", 3)));
  const round = bool(s, "rounded") ? "rounded-[var(--sf-card-radius)] overflow-hidden" : "";
  return (
    <Shell section={section} as="section" label={str(s, "heading") || "Images"}>
      <div className={`sf-section ${bool(s, "full_width") ? "px-0" : "sf-container"}`}>
        {str(s, "heading") && (
          <div className={bool(s, "full_width") ? "sf-container" : ""}>
            <SectionHeading title={str(s, "heading")} />
          </div>
        )}
        <ul
          className={`grid ${str(s, "columns_mobile") === "2" ? "grid-cols-2" : "grid-cols-1"} ${cols > 1 ? "sm:grid-cols-2" : ""} ${LG_COLS[cols]} ${GAP[str(s, "gap")] ?? GAP.small}`}
        >
          {items.map((b) => (
            <li key={b.id} data-cf-block={b.id}>
              <Linked
                href={str(b.settings, "link")}
                label={str(b.settings, "alt") || str(b.settings, "caption")}
              >
                <div className={round}>
                  <Picture
                    ctx={ctx}
                    image={b.settings.image}
                    mobile={null}
                    alt={str(b.settings, "alt")}
                    eager={false}
                  />
                </div>
                {str(b.settings, "caption") && (
                  <p className="mt-2 text-center font-medium">{str(b.settings, "caption")}</p>
                )}
              </Linked>
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}
