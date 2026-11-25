import {
  parseEmbed,
  parseVideo,
  type BlockInstance,
  type SectionInstance,
} from "@cartforge/theme-engine";
import Link from "next/link";
import { storefront } from "@/lib/api";
import { getTheme } from "@/lib/theme";
import { ProductCard } from "../product-card";
import { Countdown } from "./countdown";
import { Icon } from "./icons";
import { bool, num, RichText, Shell, str, ThemeImg, ThemeLink, type SectionCtx } from "./shared";

const WIDTH: Record<string, string> = {
  narrow: "sf-container max-w-3xl",
  page: "sf-container",
  full: "px-4 md:px-8",
};
const PAD: Record<string, string> = {
  none: "",
  small: "py-6 md:py-8",
  medium: "py-10 md:py-16",
  large: "py-16 md:py-24",
};
const GAP: Record<string, string> = {
  small: "gap-4",
  medium: "gap-8 md:gap-10",
  large: "gap-10 md:gap-16",
};
const VALIGN: Record<string, string> = {
  top: "items-start",
  center: "items-center",
  bottom: "items-end",
};
const TEXT_ALIGN: Record<string, string> = {
  left: "text-left items-start",
  center: "text-center items-center",
  right: "text-right items-end",
};
const SHOW: Record<string, string> = { all: "", desktop: "hidden md:flex", mobile: "md:hidden" };
const HEADING: Record<string, string> = {
  small: "text-xl md:text-2xl",
  medium: "text-2xl md:text-4xl",
  large: "text-3xl md:text-5xl",
  xlarge: "text-4xl leading-[1.05] md:text-6xl",
};
const COLS: Record<string, string> = {
  "1": "md:grid-cols-1",
  "2:equal": "md:grid-cols-2",
  "2:wide-left": "md:grid-cols-[2fr_1fr]",
  "2:wide-right": "md:grid-cols-[1fr_2fr]",
  "3": "md:grid-cols-3",
  "4": "md:grid-cols-2 lg:grid-cols-4",
};

/** A known-provider embed (see @cartforge/theme-engine embed.ts), lazy-loaded. */
export function EmbedFrame({
  url,
  height,
  title,
}: {
  url: string;
  height?: number;
  title?: string;
}) {
  const e = parseEmbed(url);
  if (!e) return null;
  return (
    <div
      className="w-full overflow-hidden rounded-[var(--sf-card-radius)] bg-surface"
      style={e.aspect ? { aspectRatio: e.aspect } : { height: height ?? e.height }}
    >
      <iframe
        src={e.src}
        title={title || e.label}
        loading="lazy"
        allow="encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="h-full w-full border-0"
      />
    </div>
  );
}

async function Block({ b, ctx, h1 }: { b: BlockInstance; ctx: SectionCtx; h1: boolean }) {
  const s = b.settings;
  switch (b.type) {
    case "heading": {
      const H = h1 ? "h1" : "h2";
      return str(s, "heading") ? (
        <H className={HEADING[str(s, "size")] ?? HEADING.medium}>{str(s, "heading")}</H>
      ) : null;
    }
    case "text":
      return <RichText html={str(s, "text")} className="max-w-prose" />;
    case "image": {
      const img = (
        <ThemeImg
          ctx={ctx}
          id={s.image}
          sizes="(min-width: 768px) 50vw, 100vw"
          alt={str(s, "alt")}
          className={`h-auto w-full ${!s.image ? "aspect-[4/3]" : ""} ${bool(s, "rounded") ? "rounded-[var(--sf-card-radius)]" : ""}`}
        />
      );
      return (
        <div className="w-full" style={{ maxWidth: `${num(s, "max_width", 100)}%` }}>
          {str(s, "link") ? (
            <ThemeLink href={str(s, "link")} className="block">
              {img}
            </ThemeLink>
          ) : (
            img
          )}
        </div>
      );
    }
    case "buttons": {
      const first = str(s, "label") && str(s, "link");
      const second = str(s, "label_2") && str(s, "link_2");
      if (!first && !second) return null;
      return (
        <div className="flex flex-wrap gap-3">
          {first && (
            <ThemeLink
              href={str(s, "link")}
              className="sf-button"
              variant={str(s, "style") === "outline" ? "outline" : undefined}
            >
              {str(s, "label")}
            </ThemeLink>
          )}
          {second && (
            <ThemeLink href={str(s, "link_2")} className="sf-button" variant="outline">
              {str(s, "label_2")}
            </ThemeLink>
          )}
        </div>
      );
    }
    case "video":
      return typeof s.video === "string" && parseVideo(s.video) ? (
        <EmbedFrame url={s.video} />
      ) : null;
    case "embed":
      return typeof s.url === "string" ? <EmbedFrame url={s.url} /> : null;
    case "icon":
      return (
        <div className="flex items-start gap-3">
          <span className="shrink-0 text-accent">
            <Icon name={str(s, "icon")} className="h-7 w-7" />
          </span>
          <span className="text-left">
            <span className="block font-semibold">{str(s, "title")}</span>
            {str(s, "text") && <span className="block text-sm text-muted">{str(s, "text")}</span>}
          </span>
        </div>
      );
    case "product": {
      if (!str(s, "product")) return null;
      const r = await storefront.product(str(s, "product"));
      if (r.kind !== "ok") return null;
      const t = (await getTheme()).data.settings;
      return (
        <ul className="w-full max-w-xs">
          <ProductCard
            product={r.data}
            locale={ctx.store.locale}
            card={{
              show_vendor: t.card_show_vendor === true,
              show_sale_badge: t.card_sale_badge !== false,
              second_image: t.card_second_image === true,
            }}
          />
        </ul>
      );
    }
    case "collection": {
      if (!str(s, "collection")) return null;
      const r = await storefront.collection(str(s, "collection"));
      if (r.kind !== "ok") return null;
      const c = r.data;
      return (
        <div className="group relative w-full overflow-hidden rounded-[var(--sf-card-radius)] bg-surface">
          <div className="aspect-[4/3]">
            {c.image && (
              <img
                src={c.image.medium_url ?? c.image.url}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
            )}
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-12">
            <h3 className="font-body text-lg font-semibold text-white">
              <Link href={`/collections/${c.handle}`} className="after:absolute after:inset-0">
                {c.title}
              </Link>
            </h3>
          </div>
        </div>
      );
    }
    case "countdown":
      return typeof s.ends_at === "string" ? (
        <Countdown
          endsAt={s.ends_at}
          title={str(s, "title")}
          endedText={str(s, "ended_text")}
          hideWhenEnded={bool(s, "hide_when_ended")}
        />
      ) : null;
    case "divider":
      return <hr className="w-full border-line" />;
    case "spacer":
      return <div aria-hidden style={{ height: num(s, "height", 32) }} />;
    default:
      return null;
  }
}

/** "Custom section": the merchant's own columns of blocks. */
export async function CustomSection({
  section,
  ctx,
}: {
  section: SectionInstance;
  ctx: SectionCtx;
}) {
  const s = section.settings;
  const cols = Math.min(4, Math.max(1, num(s, "columns", 2)));
  const blocks = section.blocks.filter((b) => !b.disabled);
  const byCol = Array.from({ length: cols }, (_, i) =>
    blocks.filter((b) => Math.min(cols, Math.max(1, Number(b.settings.column) || 1)) === i + 1),
  );
  const firstHeading = ctx.first ? blocks.find((b) => b.type === "heading")?.id : undefined;
  const bg = typeof s.background_image === "string" && ctx.theme.images[s.background_image];
  const key = cols === 2 ? `2:${str(s, "column_widths") || "equal"}` : String(cols);
  return (
    <Shell section={section} as="section" className="relative overflow-hidden">
      {bg && (
        <>
          <ThemeImg
            ctx={ctx}
            id={s.background_image}
            sizes="100vw"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-bg"
            style={{ opacity: num(s, "overlay", 40) / 100 }}
          />
        </>
      )}
      <div
        className={`relative ${WIDTH[str(s, "width")] ?? WIDTH.page} ${PAD[str(s, "padding")] ?? PAD.medium}`}
      >
        <div
          className={`grid ${COLS[key] ?? COLS["2:equal"]} ${GAP[str(s, "gap")] ?? GAP.medium} ${VALIGN[str(s, "vertical_align")] ?? VALIGN.center}`}
        >
          {byCol.map((list, i) => (
            <div
              key={i}
              className={`flex min-w-0 flex-col gap-5 ${bool(s, "mobile_reverse") ? "max-md:[order:calc(10-var(--i))]" : ""}`}
              style={{ ["--i" as string]: i }}
            >
              {list.map((b) => (
                <div
                  key={b.id}
                  data-cf-block={b.id}
                  className={`flex w-full flex-col ${TEXT_ALIGN[str(b.settings, "align")] ?? TEXT_ALIGN.left} ${SHOW[str(b.settings, "visibility")] ?? ""}`}
                >
                  <Block b={b} ctx={ctx} h1={b.id === firstHeading} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

/** "Embed": one known-provider embed with an optional heading. */
export function EmbedSection({ section }: { section: SectionInstance; ctx: SectionCtx }) {
  const s = section.settings;
  if (typeof s.url !== "string" || !parseEmbed(s.url)) return null;
  return (
    <Shell section={section} as="section" label={str(s, "heading") || "Embed"}>
      <div className={`sf-section ${WIDTH[str(s, "width")] ?? WIDTH.page}`}>
        {str(s, "heading") && <h2 className="mb-6 text-2xl md:text-3xl">{str(s, "heading")}</h2>}
        <EmbedFrame url={s.url} height={num(s, "height", 450)} title={str(s, "heading")} />
      </div>
    </Shell>
  );
}
