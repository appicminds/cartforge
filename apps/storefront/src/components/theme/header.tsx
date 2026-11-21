import type { SectionInstance } from "@cartforge/theme-engine";
import type { StorefrontMenuItem } from "@cartforge/types";
import Link from "next/link";
import { AnnouncementRotator } from "./announcement";
import { bool, num, Shell, str, ThemeLink, type SectionCtx } from "./shared";

function SearchForm({ id }: { id: string }) {
  return (
    <form action="/search" method="get" role="search" className="relative">
      <label htmlFor={id} className="sr-only">
        Search products
      </label>
      <input
        id={id}
        name="q"
        type="search"
        placeholder="Search"
        className="sf-field w-full pr-10 text-sm md:w-56"
      />
      <button
        type="submit"
        className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-muted hover:text-ink"
      >
        <svg
          aria-hidden
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <span className="sr-only">Search</span>
      </button>
    </form>
  );
}

function CartLink({ count }: { count: number }) {
  return (
    <Link
      href="/cart"
      className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface"
    >
      <svg
        aria-hidden
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path
          d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 8Z"
          strokeLinejoin="round"
        />
        <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      </svg>
      <span className="sr-only">Cart, {count === 1 ? "1 item" : `${count} items`}</span>
      {count > 0 && (
        <span
          aria-hidden
          data-testid="cart-count"
          className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-on-accent"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

function AccountLink() {
  return (
    <Link
      href="/account"
      className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface"
    >
      <svg
        aria-hidden
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
      </svg>
      <span className="sr-only">Account</span>
    </Link>
  );
}

function MobileItems({ items }: { items: StorefrontMenuItem[] }) {
  return (
    <ul className="flex flex-col">
      {items.map((l, i) =>
        l.children.length ? (
          <li key={`${l.url}-${i}`}>
            <details className="group/sub">
              <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-lg [&::-webkit-details-marker]:hidden">
                {l.title}
                <span aria-hidden className="transition-transform group-open/sub:rotate-180">
                  ⌄
                </span>
              </summary>
              <div className="border-l border-line pl-4">
                <ThemeLink href={l.url} className="block py-2 text-muted">
                  All {l.title}
                </ThemeLink>
                <MobileItems items={l.children} />
              </div>
            </details>
          </li>
        ) : (
          <li key={`${l.url}-${i}`}>
            <ThemeLink href={l.url} className="block py-3 text-lg">
              {l.title}
            </ThemeLink>
          </li>
        ),
      )}
    </ul>
  );
}

export function HeaderSection({
  section,
  ctx,
  cartCount,
}: {
  section: SectionInstance;
  ctx: SectionCtx;
  cartCount: number;
}) {
  const s = section.settings;
  const center = str(s, "layout") === "center";
  const items = ctx.theme.menus[str(s, "menu")] ?? [];
  const logoId = typeof s.logo === "string" ? s.logo : null;
  const logo = logoId ? ctx.theme.images[logoId] : undefined;
  const width = num(s, "logo_width", 140);
  return (
    <Shell section={section} className={`z-30 ${bool(s, "sticky") ? "sticky top-0" : "relative"}`}>
      <header className="border-b border-line bg-bg/95 backdrop-blur">
        <div
          className={`sf-container flex h-16 items-center gap-6 md:h-20 ${center ? "md:grid md:grid-cols-[1fr_auto_1fr]" : ""}`}
        >
          {/* Mobile menu: <details> works without JavaScript. */}
          <details className="group md:hidden">
            <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center [&::-webkit-details-marker]:hidden">
              <svg
                aria-hidden
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
              <span className="sr-only">Menu</span>
            </summary>
            <div className="absolute inset-x-0 top-full max-h-[80vh] overflow-y-auto border-b border-line bg-bg p-4 shadow-lg">
              {bool(s, "show_search") && <SearchForm id="search-mobile" />}
              <nav aria-label="Mobile" className="mt-4">
                <MobileItems items={items} />
              </nav>
            </div>
          </details>

          <nav
            aria-label="Main"
            className={`hidden md:block ${center ? "md:order-1" : "md:order-2 md:flex-1"}`}
          >
            <ul className="flex flex-wrap gap-6 text-[0.95rem]">
              {items.map((l, i) => (
                <li key={`${l.url}-${i}`} className="group/item relative">
                  <ThemeLink
                    href={l.url}
                    className="inline-flex items-center gap-1 py-2 hover:underline hover:underline-offset-8"
                  >
                    {l.title}
                    {l.children.length > 0 && (
                      <span aria-hidden className="text-xs">
                        ⌄
                      </span>
                    )}
                  </ThemeLink>
                  {l.children.length > 0 && (
                    <ul className="invisible absolute left-0 top-full z-40 min-w-52 rounded-[calc(var(--sf-radius)/2)] border border-line bg-bg p-2 opacity-0 shadow-lg transition-opacity group-focus-within/item:visible group-focus-within/item:opacity-100 group-hover/item:visible group-hover/item:opacity-100">
                      {l.children.map((c, j) => (
                        <li key={`${c.url}-${j}`}>
                          <ThemeLink
                            href={c.url}
                            className="block rounded px-3 py-2 hover:bg-surface"
                          >
                            {c.title}
                          </ThemeLink>
                          {c.children.map((g, k) => (
                            <ThemeLink
                              key={`${g.url}-${k}`}
                              href={g.url}
                              className="block rounded py-1.5 pl-6 pr-3 text-sm text-muted hover:bg-surface hover:text-ink"
                            >
                              {g.title}
                            </ThemeLink>
                          ))}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <Link
            href="/"
            className={`font-heading text-xl font-semibold tracking-tight md:text-2xl ${center ? "md:order-2 md:text-center" : "md:order-1"}`}
          >
            {logo ? (
              <img
                src={logo.medium_url ?? logo.url}
                alt={ctx.store.name}
                width={width}
                style={{ width, height: "auto", maxHeight: 64 }}
                className="object-contain"
              />
            ) : (
              ctx.store.name
            )}
          </Link>

          <div className="ml-auto flex items-center gap-3 md:order-3 md:justify-self-end">
            {bool(s, "show_search") && (
              <div className="hidden md:block">
                <SearchForm id="search-desktop" />
              </div>
            )}
            <AccountLink />
            <CartLink count={cartCount} />
          </div>
        </div>
      </header>
    </Shell>
  );
}

export function AnnouncementBar({ section }: { section: SectionInstance; ctx: SectionCtx }) {
  const items = section.blocks
    .filter((b) => !b.disabled && str(b.settings, "text"))
    .map((b) => ({ id: b.id, text: str(b.settings, "text"), link: str(b.settings, "link") }));
  if (!items.length) return null;
  return (
    <Shell section={section}>
      <div className="px-4 py-2 text-center text-sm" role="region" aria-label="Announcements">
        <AnnouncementRotator items={items} rotate={bool(section.settings, "rotate")} />
      </div>
    </Shell>
  );
}
