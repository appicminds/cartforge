import type { BlockInstance } from "@cartforge/theme-engine";
import { HEADING_SIZE, RichText, str, ThemeLink } from "./shared";

/** Heading / text / buttons blocks shared by banners, rich text and image with text. */
export function ContentBlocks({
  blocks,
  h1,
  light = false,
}: {
  blocks: BlockInstance[];
  /** The first heading becomes the page's h1. */
  h1?: boolean;
  light?: boolean;
}) {
  let headingDone = false;
  return (
    <>
      {blocks
        .filter((b) => !b.disabled)
        .map((b) => {
          const s = b.settings;
          if (b.type === "heading") {
            if (!str(s, "heading")) return null;
            const Tag = h1 && !headingDone ? "h1" : "h2";
            headingDone = true;
            return (
              <Tag
                key={b.id}
                data-cf-block={b.id}
                className={HEADING_SIZE[str(s, "size")] ?? HEADING_SIZE.medium}
              >
                {str(s, "heading")}
              </Tag>
            );
          }
          if (b.type === "text")
            return (
              <div key={b.id} data-cf-block={b.id} className="max-w-2xl">
                <RichText
                  html={str(s, "text")}
                  className={`text-lg ${light ? "" : "text-muted"} [&_*]:text-inherit`}
                />
              </div>
            );
          if (b.type === "buttons") {
            const first = str(s, "label") && str(s, "link");
            const second = str(s, "label_2") && str(s, "link_2");
            if (!first && !second) return null;
            return (
              <div key={b.id} data-cf-block={b.id} className="mt-2 flex flex-wrap gap-3">
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
          return null;
        })}
    </>
  );
}
