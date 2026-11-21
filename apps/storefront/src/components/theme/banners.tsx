import type { SectionInstance } from "@cartforge/theme-engine";
import { ContentBlocks } from "./content-blocks";
import { Slideshow } from "./slideshow";
import { ALIGN, bool, num, Shell, str, ThemeImg, ThemeLink, type SectionCtx } from "./shared";

const HEIGHT: Record<string, string> = {
  small: "min-h-[18rem] md:min-h-[24rem]",
  medium: "min-h-[24rem] md:min-h-[34rem]",
  large: "min-h-[30rem] md:min-h-[44rem]",
  adapt: "",
};
const TEXT_ALIGN: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};
const POSITION: Record<string, string> = {
  "top-left": "justify-start items-start",
  "center-left": "justify-center items-start",
  "bottom-left": "justify-end items-start",
  center: "justify-center items-center",
  "bottom-center": "justify-end items-center",
  "center-right": "justify-center items-end",
};

export function ImageBanner({ section, ctx }: { section: SectionInstance; ctx: SectionCtx }) {
  const s = section.settings;
  const light = bool(s, "text_light");
  const hasImage = typeof s.image === "string" && !!ctx.theme.images[s.image as string];
  const adapt = str(s, "height") === "adapt" && hasImage;
  const fit = adapt ? "h-auto w-full" : "h-full w-full object-cover";
  return (
    <Shell section={section} as="section" className="relative overflow-hidden">
      <div className={`relative flex ${adapt ? "" : (HEIGHT[str(s, "height")] ?? HEIGHT.medium!)}`}>
        <div className={adapt ? "w-full" : "absolute inset-0"}>
          {s.mobile_image ? (
            <>
              <ThemeImg
                ctx={ctx}
                id={s.mobile_image}
                sizes="100vw"
                eager={ctx.first}
                className={`${fit} md:hidden`}
              />
              <ThemeImg
                ctx={ctx}
                id={s.image}
                sizes="100vw"
                eager={ctx.first}
                className={`${fit} hidden md:block`}
              />
            </>
          ) : (
            <ThemeImg ctx={ctx} id={s.image} sizes="100vw" eager={ctx.first} className={fit} />
          )}
        </div>
        {hasImage && (
          <div
            aria-hidden
            className="absolute inset-0 bg-black"
            style={{ opacity: num(s, "overlay", 30) / 100 }}
          />
        )}
        <div
          className={`${adapt ? "absolute inset-0" : "relative w-full"} z-10 sf-container flex flex-col gap-4 py-14 md:py-20 ${POSITION[str(s, "position")] ?? POSITION.center} ${TEXT_ALIGN[str(s, "alignment")] ?? "text-center"} ${hasImage && light ? "text-white [&_.sf-prose]:text-white" : ""}`}
        >
          <ContentBlocks blocks={section.blocks} h1={ctx.first} light={hasImage && light} />
        </div>
      </div>
    </Shell>
  );
}

export function SlideshowSection({ section, ctx }: { section: SectionInstance; ctx: SectionCtx }) {
  const s = section.settings;
  const slides = section.blocks.filter((b) => !b.disabled);
  if (!slides.length) return null;
  return (
    <Shell section={section} as="section" label="Slideshow" className="relative">
      <Slideshow
        autoplay={bool(s, "autoplay")}
        seconds={num(s, "speed", 5)}
        count={slides.length}
        height={HEIGHT[str(s, "height")] ?? HEIGHT.medium!}
      >
        {slides.map((b, i) => {
          const bs = b.settings;
          const hasImage = typeof bs.image === "string" && !!ctx.theme.images[bs.image as string];
          const Heading = ctx.first && i === 0 ? "h1" : "h2";
          return (
            <div key={b.id} data-cf-block={b.id} className="relative grid h-full w-full">
              <div className="absolute inset-0">
                <ThemeImg
                  ctx={ctx}
                  id={bs.image}
                  sizes="100vw"
                  eager={ctx.first && i === 0}
                  className="h-full w-full object-cover"
                />
                {!hasImage && (
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-br from-accent/80 to-ink/90"
                  />
                )}
              </div>
              <div
                aria-hidden
                className="absolute inset-0 bg-black"
                style={{ opacity: hasImage ? num(s, "overlay", 30) / 100 : 0 }}
              />
              <div
                className={`relative z-10 sf-container flex flex-col justify-center gap-4 py-16 text-white ${ALIGN[str(bs, "alignment")] ?? ALIGN.center}`}
              >
                {str(bs, "heading") && (
                  <Heading className="max-w-3xl text-4xl leading-[1.05] md:text-6xl">
                    {str(bs, "heading")}
                  </Heading>
                )}
                {str(bs, "subheading") && (
                  <p className="max-w-xl text-lg md:text-xl">{str(bs, "subheading")}</p>
                )}
                {str(bs, "button_label") && str(bs, "button_link") && (
                  <ThemeLink href={str(bs, "button_link")} className="sf-button">
                    {str(bs, "button_label")}
                  </ThemeLink>
                )}
              </div>
            </div>
          );
        })}
      </Slideshow>
    </Shell>
  );
}

export function Hero({ section, ctx }: { section: SectionInstance; ctx: SectionCtx }) {
  const s = section.settings;
  const Heading = ctx.first ? "h1" : "h2";
  const center = str(s, "alignment") === "center";
  return (
    <Shell section={section} as="section">
      <div
        className={`sf-container flex min-h-[22rem] flex-col justify-center gap-6 py-16 md:min-h-[30rem] md:py-24 ${center ? "items-center text-center" : "items-start"}`}
      >
        <Heading className="max-w-3xl text-4xl leading-[1.05] md:text-6xl">
          {str(s, "heading") || ctx.store.name}
        </Heading>
        {str(s, "subheading") && (
          <p className="max-w-xl text-lg text-muted md:text-xl">{str(s, "subheading")}</p>
        )}
        {str(s, "button_label") && str(s, "button_link") && (
          <ThemeLink href={str(s, "button_link")} className="sf-button">
            {str(s, "button_label")}
          </ThemeLink>
        )}
      </div>
    </Shell>
  );
}
