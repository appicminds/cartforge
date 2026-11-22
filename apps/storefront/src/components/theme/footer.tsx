import type { SectionInstance } from "@cartforge/theme-engine";
import { MarketSelector } from "../market-selector";
import { SocialLinks } from "./icons";
import { bool, RichText, Shell, str, ThemeLink, type SectionCtx } from "./shared";

export function FooterSection({ section, ctx }: { section: SectionInstance; ctx: SectionCtx }) {
  const s = section.settings;
  const heading = "mb-4 font-body text-sm font-semibold uppercase tracking-wider";
  const blocks = section.blocks.filter((b) => !b.disabled);
  return (
    <Shell section={section} className="mt-16">
      <footer className="border-t border-line">
        <div className="sf-container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
          {blocks.map((b) => {
            const bs = b.settings;
            if (b.type === "brand")
              return (
                <div key={b.id} data-cf-block={b.id}>
                  <p className="font-heading text-xl font-semibold">{ctx.store.name}</p>
                  <RichText html={str(bs, "text")} className="mt-3 max-w-xs text-sm text-muted" />
                  {bool(bs, "show_email") && ctx.store.contact_email && (
                    <p className="mt-3 text-sm">
                      <a href={`mailto:${ctx.store.contact_email}`} className="sf-link">
                        {ctx.store.contact_email}
                      </a>
                    </p>
                  )}
                  {bool(s, "show_social") && (
                    <div className="mt-5">
                      <SocialLinks settings={ctx.theme.data.settings} />
                    </div>
                  )}
                </div>
              );
            if (b.type === "menu") {
              const items = ctx.theme.menus[str(bs, "menu")] ?? [];
              if (!items.length) return null;
              return (
                <nav key={b.id} data-cf-block={b.id} aria-label={str(bs, "heading") || "Footer"}>
                  {str(bs, "heading") && <h2 className={heading}>{str(bs, "heading")}</h2>}
                  <ul className="space-y-2 text-sm text-muted">
                    {items.map((l, i) => (
                      <li key={`${l.url}-${i}`}>
                        <ThemeLink href={l.url} className="hover:text-ink">
                          {l.title}
                        </ThemeLink>
                      </li>
                    ))}
                  </ul>
                </nav>
              );
            }
            if (b.type === "text")
              return (
                <div key={b.id} data-cf-block={b.id}>
                  {str(bs, "heading") && <h2 className={heading}>{str(bs, "heading")}</h2>}
                  <RichText html={str(bs, "text")} className="text-sm text-muted" />
                </div>
              );
            return null;
          })}
        </div>
        <div className="border-t border-line">
          <div className="sf-container flex flex-wrap items-center justify-between gap-4 py-6 text-xs text-muted">
            {bool(s, "show_market_selector") && <MarketSelector />}
            <p>{str(s, "copyright") || `© ${new Date().getFullYear()} ${ctx.store.name}`}</p>
            {bool(s, "show_powered_by") && <p>Powered by CartForge</p>}
          </div>
        </div>
      </footer>
    </Shell>
  );
}
