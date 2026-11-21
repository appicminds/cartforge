import { parseVideo, type SectionInstance } from "@cartforge/theme-engine";
import { ContentBlocks } from "./content-blocks";
import { Icon } from "./icons";
import {
  ALIGN,
  bool,
  LG_COLS,
  MD_COLS,
  num,
  RichText,
  SectionHeading,
  Shell,
  str,
  ThemeImg,
  ThemeLink,
  type SectionCtx,
} from "./shared";

const RATIO: Record<string, string> = {
  square: "aspect-square",
  portrait: "aspect-[4/5]",
  landscape: "aspect-[4/3]",
  circle: "aspect-square rounded-full",
};

export function RichTextSection({ section, ctx }: { section: SectionInstance; ctx: SectionCtx }) {
  const s = section.settings;
  if (!section.blocks.some((b) => !b.disabled)) return null;
  return (
    <Shell section={section} as="section">
      <div
        className={`sf-section sf-container flex flex-col gap-4 ${str(s, "width") === "wide" ? "max-w-5xl" : "max-w-3xl"} ${ALIGN[str(s, "alignment")] ?? ALIGN.center}`}
      >
        <ContentBlocks blocks={section.blocks} h1={ctx.first} />
      </div>
    </Shell>
  );
}

export function ImageWithText({ section, ctx }: { section: SectionInstance; ctx: SectionCtx }) {
  const s = section.settings;
  const right = str(s, "image_position") === "right";
  return (
    <Shell section={section} as="section">
      <div className="sf-section sf-container grid items-center gap-8 md:grid-cols-2 md:gap-14">
        <div
          className={`overflow-hidden rounded-[var(--sf-card-radius)] ${right ? "md:order-2" : ""}`}
        >
          <ThemeImg
            ctx={ctx}
            id={s.image}
            sizes="(min-width: 768px) 50vw, 100vw"
            className="aspect-[4/3] h-full w-full object-cover"
          />
        </div>
        <div
          className={`flex flex-col gap-4 ${str(s, "alignment") === "center" ? "items-center text-center" : "items-start"}`}
        >
          <ContentBlocks blocks={section.blocks} h1={ctx.first} />
        </div>
      </div>
    </Shell>
  );
}

export function Multicolumn({ section, ctx }: { section: SectionInstance; ctx: SectionCtx }) {
  const s = section.settings;
  const cols = Math.min(4, Math.max(1, num(s, "columns", 3)));
  const columns = section.blocks.filter((b) => !b.disabled);
  if (!columns.length) return null;
  const ratio = str(s, "image_ratio");
  const withImages = columns.some(
    (b) => typeof b.settings.image === "string" && ctx.theme.images[b.settings.image as string],
  );
  return (
    <Shell section={section} as="section" label={str(s, "heading") || undefined}>
      <div className="sf-section sf-container">
        {str(s, "heading") && <SectionHeading title={str(s, "heading")} />}
        <ul className={`grid gap-8 sm:grid-cols-2 ${MD_COLS[cols]} ${LG_COLS[cols]}`}>
          {columns.map((b) => {
            const bs = b.settings;
            return (
              <li
                key={b.id}
                data-cf-block={b.id}
                className={`flex flex-col gap-3 ${ALIGN[str(s, "alignment")] ?? ALIGN.center}`}
              >
                {withImages && (
                  <div
                    className={`w-full overflow-hidden ${RATIO[ratio] ?? RATIO.landscape} ${ratio === "circle" ? "mx-auto max-w-40" : "rounded-[var(--sf-card-radius)]"}`}
                  >
                    <ThemeImg
                      ctx={ctx}
                      id={bs.image}
                      sizes="(min-width: 1024px) 33vw, 100vw"
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                {str(bs, "title") && <h3 className="text-xl">{str(bs, "title")}</h3>}
                <RichText html={str(bs, "text")} className="text-muted" />
                {str(bs, "link_label") && str(bs, "link") && (
                  <ThemeLink href={str(bs, "link")} className="sf-link text-sm font-medium">
                    {str(bs, "link_label")}
                  </ThemeLink>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Shell>
  );
}

export function TrustBadges({ section }: { section: SectionInstance; ctx: SectionCtx }) {
  const items = section.blocks.filter((b) => !b.disabled);
  if (!items.length) return null;
  const grid = str(section.settings, "layout") === "grid";
  return (
    <Shell section={section} as="section" label="Why shop with us">
      <div className="sf-container py-8 md:py-10">
        <ul
          className={
            grid
              ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
              : "flex flex-wrap justify-center gap-x-10 gap-y-6"
          }
        >
          {items.map((b) => (
            <li key={b.id} data-cf-block={b.id} className="flex items-start gap-3 sm:max-w-64">
              <span className="mt-0.5 shrink-0 text-accent">
                <Icon name={str(b.settings, "icon")} className="h-7 w-7" />
              </span>
              <span>
                <span className="block font-semibold">{str(b.settings, "title")}</span>
                {str(b.settings, "text") && (
                  <span className="block text-sm text-muted">{str(b.settings, "text")}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}

export function Testimonials({ section }: { section: SectionInstance; ctx: SectionCtx }) {
  const s = section.settings;
  const quotes = section.blocks.filter((b) => !b.disabled);
  if (!quotes.length) return null;
  const cols = Math.min(3, Math.max(1, num(s, "columns", 3)));
  return (
    <Shell section={section} as="section" label={str(s, "heading") || "Testimonials"}>
      <div className="sf-section sf-container">
        {str(s, "heading") && <SectionHeading title={str(s, "heading")} />}
        <ul className={`grid gap-6 md:grid-cols-2 ${LG_COLS[cols]}`}>
          {quotes.map((b) => {
            const stars = num(b.settings, "rating");
            return (
              <li
                key={b.id}
                data-cf-block={b.id}
                className="flex flex-col gap-4 rounded-[var(--sf-card-radius)] border border-line bg-bg p-6"
              >
                {stars > 0 && (
                  <p className="text-accent" aria-label={`${stars} out of 5 stars`}>
                    <span aria-hidden>
                      {"★".repeat(stars)}
                      {"☆".repeat(5 - stars)}
                    </span>
                  </p>
                )}
                <blockquote className="text-lg">“{str(b.settings, "quote")}”</blockquote>
                <p className="mt-auto text-sm">
                  <span className="font-semibold">{str(b.settings, "author")}</span>
                  {str(b.settings, "detail") && (
                    <span className="text-muted"> · {str(b.settings, "detail")}</span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </Shell>
  );
}

export function Faq({ section }: { section: SectionInstance; ctx: SectionCtx }) {
  const s = section.settings;
  const rows = section.blocks.filter((b) => !b.disabled);
  if (!rows.length) return null;
  return (
    <Shell section={section} as="section" label={str(s, "heading") || "Questions"}>
      <div className="sf-section sf-container max-w-3xl">
        {str(s, "heading") && <SectionHeading title={str(s, "heading")} />}
        <div className="divide-y divide-line border-y border-line">
          {rows.map((b, i) => (
            <details
              key={b.id}
              data-cf-block={b.id}
              className="group py-1"
              open={bool(s, "open_first") && i === 0}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg font-medium [&::-webkit-details-marker]:hidden">
                {str(b.settings, "question")}
                <span
                  aria-hidden
                  className="text-2xl leading-none transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <RichText html={str(b.settings, "answer")} className="pb-5 text-muted" />
            </details>
          ))}
        </div>
      </div>
    </Shell>
  );
}

export function Video({ section }: { section: SectionInstance; ctx: SectionCtx }) {
  const s = section.settings;
  const v = typeof s.video === "string" ? parseVideo(s.video) : null;
  const src = v
    ? v.provider === "youtube"
      ? `https://www.youtube-nocookie.com/embed/${v.id}?rel=0`
      : `https://player.vimeo.com/video/${v.id}?dnt=1`
    : null;
  return (
    <Shell section={section} as="section" label={str(s, "heading") || "Video"}>
      <div className={`sf-section ${bool(s, "full_width") ? "" : "sf-container"}`}>
        {str(s, "heading") && (
          <div className={bool(s, "full_width") ? "sf-container" : ""}>
            <SectionHeading title={str(s, "heading")} />
          </div>
        )}
        <div className="aspect-video w-full overflow-hidden bg-surface">
          {src ? (
            <iframe
              src={src}
              title={str(s, "heading") || "Video"}
              loading="lazy"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted">
              Add a YouTube or Vimeo link
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

export function Spacer({ section }: { section: SectionInstance; ctx: SectionCtx }) {
  const s = section.settings;
  return (
    <Shell section={section}>
      <div
        aria-hidden
        className="sf-container flex items-center"
        style={{ height: num(s, "height", 48) }}
      >
        {bool(s, "divider") && <hr className="w-full border-line" />}
      </div>
    </Shell>
  );
}
