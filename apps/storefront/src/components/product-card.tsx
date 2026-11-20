import type { StorefrontProduct } from "@cartforge/types";
import Link from "next/link";
import { getTheme } from "@/lib/theme";
import { Price } from "./price";

export function ProductCard({
  product,
  locale,
  priority = false,
}: {
  product: StorefrontProduct;
  locale?: string;
  priority?: boolean;
}) {
  const card = getTheme().settings.product_card;
  const img = product.images[0];
  const onSale =
    product.compare_at_min_minor !== null &&
    product.price_min_minor !== null &&
    product.compare_at_min_minor > product.price_min_minor;
  return (
    <li className="group relative flex flex-col">
      <div className="sf-card-media relative rounded-[calc(var(--sf-radius)/2)]">
        {img ? (
          // Plain <img>: sizes come from the API's derivatives, no optimizer needed.
          <img
            src={img.medium_url ?? img.url}
            srcSet={
              [
                img.thumb_url && `${img.thumb_url} 200w`,
                img.medium_url && `${img.medium_url} 600w`,
                img.large_url && `${img.large_url} 1200w`,
              ]
                .filter(Boolean)
                .join(", ") || undefined
            }
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            alt={img.alt ?? ""}
            width={img.width ?? undefined}
            height={img.height ?? undefined}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
          />
        ) : (
          <div aria-hidden className="flex h-full items-center justify-center text-muted">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="9" cy="10" r="2" />
              <path d="M21 17l-5-5-9 8" />
            </svg>
          </div>
        )}
        <div className="absolute left-2 top-2 flex gap-1">
          {!product.available && (
            <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-medium text-ink">
              Sold out
            </span>
          )}
          {product.available && onSale && card.show_sale_badge && (
            <span className="rounded-full bg-sale px-2.5 py-1 text-xs font-medium text-white">
              Sale
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1">
        {card.show_vendor && product.vendor && (
          <p className="text-xs uppercase tracking-wider text-muted">{product.vendor}</p>
        )}
        <h3 className="font-body text-base font-medium leading-snug">
          <Link
            href={`/products/${product.handle}`}
            className="after:absolute after:inset-0 hover:underline hover:underline-offset-4"
          >
            {product.title}
          </Link>
        </h3>
        <Price product={product} currency={product.currency} locale={locale} />
      </div>
    </li>
  );
}

export function ProductGrid({
  products,
  locale,
  eager = 0,
}: {
  products: StorefrontProduct[];
  locale?: string;
  eager?: number;
}) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} locale={locale} priority={i < eager} />
      ))}
    </ul>
  );
}
