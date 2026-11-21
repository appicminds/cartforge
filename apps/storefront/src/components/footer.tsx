import type {
  StorefrontCategory,
  StorefrontCollectionSummary,
  StorefrontStore,
} from "@cartforge/types";
import Link from "next/link";
import { getTheme } from "@/lib/theme";
import { MarketSelector } from "./market-selector";

export function Footer({
  store,
  categories,
  collections,
}: {
  store: StorefrontStore;
  categories: StorefrontCategory[];
  collections: StorefrontCollectionSummary[];
}) {
  const { footer } = getTheme().settings;
  const top = categories.filter((c) => c.depth === 0 && c.product_count > 0).slice(0, 6);
  const cols = collections.filter((c) => c.product_count > 0).slice(0, 6);
  const heading = "mb-4 font-body text-sm font-semibold uppercase tracking-wider";
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="sf-container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-heading text-xl font-semibold">{store.name}</p>
          {footer.text && <p className="mt-3 max-w-xs text-sm text-muted">{footer.text}</p>}
          {store.contact_email && (
            <p className="mt-3 text-sm">
              <a href={`mailto:${store.contact_email}`} className="sf-link">
                {store.contact_email}
              </a>
            </p>
          )}
        </div>
        <nav aria-label="Shop">
          <h2 className={heading}>Shop</h2>
          <ul className="space-y-2 text-sm text-muted">
            <li>
              <Link href="/products" className="hover:text-ink">
                All products
              </Link>
            </li>
            <li>
              <Link href="/collections" className="hover:text-ink">
                Collections
              </Link>
            </li>
            <li>
              <Link href="/search" className="hover:text-ink">
                Search
              </Link>
            </li>
          </ul>
        </nav>
        {top.length > 0 && (
          <nav aria-label="Categories">
            <h2 className={heading}>Categories</h2>
            <ul className="space-y-2 text-sm text-muted">
              {top.map((c) => (
                <li key={c.id}>
                  <Link href={`/categories/${c.handle}`} className="hover:text-ink">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {cols.length > 0 && (
          <nav aria-label="Collections">
            <h2 className={heading}>Collections</h2>
            <ul className="space-y-2 text-sm text-muted">
              {cols.map((c) => (
                <li key={c.id}>
                  <Link href={`/collections/${c.handle}`} className="hover:text-ink">
                    {c.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
      <div className="border-t border-line">
        <div className="sf-container flex flex-wrap items-center justify-between gap-4 py-6 text-xs text-muted">
          <MarketSelector />
          <p>
            © {new Date().getFullYear()} {store.name}
          </p>
          <p>Powered by CartForge</p>
        </div>
      </div>
    </footer>
  );
}
