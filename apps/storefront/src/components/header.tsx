import type { StorefrontCategory, StorefrontStore } from "@cartforge/types";
import Link from "next/link";
import { getTheme } from "@/lib/theme";

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

export function Header({
  store,
  categories,
}: {
  store: StorefrontStore;
  categories: StorefrontCategory[];
}) {
  const { header } = getTheme().settings;
  const top = categories.filter((c) => c.depth === 0 && c.product_count > 0).slice(0, 5);
  const links = [{ href: "/products", label: "Shop all" }].concat(
    top.map((c) => ({ href: `/categories/${c.handle}`, label: c.name })),
    [{ href: "/collections", label: "Collections" }],
  );
  return (
    <>
      {header.announcement && (
        <div className="bg-accent px-4 py-2 text-center text-sm text-on-accent">
          {header.announcement}
        </div>
      )}
      <header
        className={`z-30 border-b border-line bg-bg/95 backdrop-blur ${header.sticky ? "sticky top-0" : ""}`}
      >
        <div
          className={`sf-container flex h-16 items-center gap-6 md:h-20 ${header.layout === "center" ? "md:grid md:grid-cols-[1fr_auto_1fr]" : ""}`}
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
            <div className="absolute inset-x-0 top-full border-b border-line bg-bg p-4 shadow-lg">
              <SearchForm id="search-mobile" />
              <nav aria-label="Mobile" className="mt-4">
                <ul className="flex flex-col">
                  {links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="block py-3 text-lg">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </details>

          <nav
            aria-label="Main"
            className={`hidden md:block ${header.layout === "center" ? "md:order-1" : "md:order-2 md:flex-1"}`}
          >
            <ul className="flex flex-wrap gap-6 text-[0.95rem]">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:underline hover:underline-offset-8">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <Link
            href="/"
            className={`font-heading text-xl font-semibold tracking-tight md:text-2xl ${header.layout === "center" ? "md:order-2 md:text-center" : "md:order-1"}`}
          >
            {store.name}
          </Link>

          <div className="ml-auto hidden md:order-3 md:block md:justify-self-end">
            <SearchForm id="search-desktop" />
          </div>
        </div>
      </header>
    </>
  );
}
