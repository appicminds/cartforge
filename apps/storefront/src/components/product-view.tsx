"use client";

import type { StorefrontImage, StorefrontProduct } from "@cartforge/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { addToCart } from "@/app/actions/cart";
import { formatMoney } from "@/lib/money";
import { choose, initialVariant, selectionOf, valueState } from "@/lib/variants";
import { Icon } from "./theme/icons";

function Gallery({
  images,
  active,
  onSelect,
  title,
}: {
  images: StorefrontImage[];
  active: number;
  onSelect: (i: number) => void;
  title: string;
}) {
  const img = images[active];
  if (!img) {
    return (
      <div className="sf-card-media flex items-center justify-center rounded-[var(--sf-card-radius)] text-muted">
        <span>No image</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-[var(--sf-card-radius)] bg-surface">
        <img
          key={img.url}
          src={img.large_url ?? img.url}
          srcSet={
            [img.medium_url && `${img.medium_url} 600w`, img.large_url && `${img.large_url} 1200w`]
              .filter(Boolean)
              .join(", ") || undefined
          }
          sizes="(min-width: 1024px) 55vw, 100vw"
          alt={img.alt ?? title}
          width={img.width ?? undefined}
          height={img.height ?? undefined}
          fetchPriority="high"
          className="h-auto w-full object-contain"
        />
      </div>
      {images.length > 1 && (
        <ul className="grid grid-cols-5 gap-2" aria-label="Product images">
          {images.map((im, i) => (
            <li key={im.url}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={i === active ? "true" : undefined}
                className={`block w-full overflow-hidden rounded-[var(--sf-card-radius)] border-2 bg-surface ${i === active ? "border-ink" : "border-transparent hover:border-line"}`}
              >
                <img
                  src={im.thumb_url ?? im.url}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
                <span className="sr-only">
                  Show image {i + 1} of {images.length}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface InfoBlock {
  id: string;
  type: string;
  settings: Record<string, unknown>;
}

const DEFAULT_BLOCKS: InfoBlock[] = [
  "vendor",
  "title",
  "price",
  "variant_picker",
  "buy_buttons",
  "description",
].map((type) => ({ id: type, type, settings: {} }));

export function ProductView({
  product,
  locale,
  canBuy = true,
  blocks = DEFAULT_BLOCKS,
  galleryRight = false,
  stickyInfo = true,
}: {
  product: StorefrontProduct;
  locale?: string;
  /** False for previews of products customers can't buy yet. */
  canBuy?: boolean;
  /** The theme's "Product information" blocks, in order. */
  blocks?: InfoBlock[];
  galleryRight?: boolean;
  stickyInfo?: boolean;
}) {
  const { variants, options, currency } = product;
  /** Markets: the merchant doesn't sell this product in the shopper's country. */
  const inMarket = product.market_available !== false;
  const [variantId, setVariantId] = useState(() => initialVariant(variants)?.id);
  const [imageIndex, setImageIndex] = useState(() => initialVariant(variants)?.image_index ?? 0);
  const [qty, setQty] = useState(1);
  const qtyId = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState<{ ok: boolean; message: string } | null>(null);

  const variant = useMemo(
    () => variants.find((v) => v.id === variantId) ?? variants[0],
    [variants, variantId],
  );
  const selection = useMemo(() => (variant ? selectionOf(variant) : {}), [variant]);
  const hasOptions = options.length > 0 && variants.length > 1;

  // Deep links: ?variant=<id> selects that variant after hydration.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("variant");
    const v = wanted ? variants.find((x) => x.id === wanted) : undefined;
    if (v) {
      setVariantId(v.id);
      if (v.image_index !== null) setImageIndex(v.image_index);
    }
  }, [variants]);

  const pick = (option: string, value: string) => {
    const next = choose(variants, selection, option, value);
    if (!next) return;
    setVariantId(next.id);
    if (next.image_index !== null) setImageIndex(next.image_index);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", next.id);
    window.history.replaceState(null, "", url);
  };

  const price = variant?.price_minor ?? null;
  const compare = variant?.compare_at_minor ?? null;
  const onSale = price !== null && compare !== null && compare > price;
  const available = variant?.available ?? false;

  const text = (b: InfoBlock, k: string) =>
    typeof b.settings[k] === "string" ? (b.settings[k] as string) : "";
  const dropdown = (b: InfoBlock) => b.settings.style === "dropdown";
  const priceBlock = (
    <div className="flex items-center gap-3 text-xl" aria-live="polite">
      {price === null ? (
        <span className="text-muted">Price on request</span>
      ) : onSale ? (
        <>
          <span className="sr-only">Sale price</span>
          <span className="font-semibold text-sale">{formatMoney(price, currency, locale)}</span>
          <span className="sr-only">Regular price</span>
          <s className="text-base text-muted">{formatMoney(compare!, currency, locale)}</s>
          <span className="rounded-full bg-sale px-2.5 py-0.5 text-xs font-medium text-white">
            Sale
          </span>
        </>
      ) : (
        <span>{formatMoney(price, currency, locale)}</span>
      )}
    </div>
  );
  const picker = (b: InfoBlock) =>
    hasOptions &&
    options.map((opt) =>
      dropdown(b) ? (
        <div key={opt.name}>
          <label htmlFor={`${qtyId}-${opt.name}`} className="mb-2 block text-sm">
            {opt.name}
          </label>
          <select
            id={`${qtyId}-${opt.name}`}
            className="sf-select w-full"
            value={selection[opt.name] ?? ""}
            onChange={(e) => pick(opt.name, e.target.value)}
          >
            {opt.values.map((value) => {
              const state = valueState(variants, selection, opt.name, value);
              return (
                <option key={value} value={value}>
                  {value}
                  {state === "sold_out"
                    ? " — sold out"
                    : state === "unavailable"
                      ? " — unavailable"
                      : ""}
                </option>
              );
            })}
          </select>
        </div>
      ) : (
        <fieldset key={opt.name}>
          <legend className="mb-2 text-sm">
            {opt.name}: <span className="font-semibold">{selection[opt.name]}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {opt.values.map((value) => {
              const state = valueState(variants, selection, opt.name, value);
              const checked = selection[opt.name] === value;
              return (
                <label
                  key={value}
                  className={`relative inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-[var(--sf-radius)] border px-4 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${checked ? "border-ink bg-ink text-bg" : "border-line hover:border-ink"} ${state !== "available" && !checked ? "text-muted line-through decoration-1" : ""}`}
                >
                  <input
                    type="radio"
                    name={`option-${opt.name}`}
                    value={value}
                    checked={checked}
                    onChange={() => pick(opt.name, value)}
                    className="sr-only"
                  />
                  {value}
                  {state === "sold_out" && <span className="sr-only"> (sold out)</span>}
                  {state === "unavailable" && (
                    <span className="sr-only"> (unavailable with current selection)</span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      ),
    );

  const renderBlock = (b: InfoBlock) => {
    switch (b.type) {
      case "vendor":
        return product.vendor ? (
          <p className="text-xs uppercase tracking-wider text-muted">{product.vendor}</p>
        ) : null;
      case "title":
        return <h1 className="text-3xl md:text-4xl">{product.title}</h1>;
      case "price":
        return priceBlock;
      case "variant_picker":
        return hasOptions ? <div className="flex flex-col gap-5">{picker(b)}</div> : null;
      case "buy_buttons":
        return (
          <div className="flex flex-col gap-4">
            <p className="flex items-center gap-2 text-sm" aria-live="polite">
              <span
                aria-hidden
                className={`inline-block h-2.5 w-2.5 rounded-full ${available ? "bg-emerald-600" : "bg-muted"}`}
              />
              {available ? "In stock" : "Sold out"}
            </p>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor={qtyId} className="mb-2 block text-sm">
                  Quantity
                </label>
                <div className="flex h-12 items-center rounded-[var(--sf-radius)] border border-line">
                  <button
                    type="button"
                    className="h-full w-11 text-lg disabled:opacity-40"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <input
                    id={qtyId}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={99}
                    value={qty}
                    onChange={(e) =>
                      setQty(Math.min(99, Math.max(1, Number.parseInt(e.target.value, 10) || 1)))
                    }
                    className="h-full w-12 border-x border-line bg-transparent text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    className="h-full w-11 text-lg disabled:opacity-40"
                    onClick={() => setQty((q) => Math.min(99, q + 1))}
                    disabled={qty >= 99}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="sf-button min-w-56 flex-1"
                disabled={
                  !canBuy || !inMarket || !available || !variant || price === null || pending
                }
                aria-busy={pending}
                onClick={() => {
                  if (!variant) return;
                  setAdded(null);
                  startTransition(async () => {
                    const r = await addToCart(variant.id, qty);
                    setAdded({ ok: r.ok, message: r.message });
                    if (r.ok) router.refresh(); // header count
                  });
                }}
              >
                {!inMarket
                  ? "Not available in your region"
                  : !available
                    ? "Sold out"
                    : pending
                      ? "Adding…"
                      : "Add to cart"}
              </button>
            </div>
            {!inMarket && (
              <p role="note" className="-mt-2 text-sm text-muted" data-testid="not-in-market">
                This product isn&apos;t sold in your country. Change your country at the bottom of
                the page if you&apos;re shopping for somewhere else.
              </p>
            )}
            <div aria-live="polite" className="-mt-2 min-h-6 text-sm">
              {added && (
                <p className={added.ok ? "flex flex-wrap items-center gap-x-3" : "text-sale"}>
                  <span>{added.message}</span>
                  {added.ok && (
                    <Link href="/cart" className="sf-link font-medium">
                      View cart and check out
                    </Link>
                  )}
                </p>
              )}
            </div>
          </div>
        );
      case "description":
        return product.description_html ? (
          <div
            className="sf-prose border-t border-line pt-6"
            // Sanitized by the API against an allow-list when saved.
            dangerouslySetInnerHTML={{ __html: product.description_html }}
          />
        ) : null;
      case "text":
        return text(b, "text") ? (
          <div className="sf-prose" dangerouslySetInnerHTML={{ __html: text(b, "text") }} />
        ) : null;
      case "collapsible":
        return (
          <details className="group border-y border-line">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 font-medium [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                {text(b, "icon") && text(b, "icon") !== "none" && (
                  <Icon name={text(b, "icon")} className="h-5 w-5" />
                )}
                {text(b, "heading")}
              </span>
              <span
                aria-hidden
                className="text-xl leading-none transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <div
              className="sf-prose pb-4 text-muted"
              dangerouslySetInnerHTML={{ __html: text(b, "content") }}
            />
          </details>
        );
      case "icon_text":
        return (
          <p className="flex items-center gap-2 text-sm">
            <Icon name={text(b, "icon")} className="h-5 w-5 text-accent" />
            {text(b, "text")}
          </p>
        );
      case "share":
        return <ShareLinks title={product.title} />;
      default:
        return null;
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-16">
      <div className={galleryRight ? "lg:order-2" : undefined}>
        <Gallery
          images={product.images}
          active={Math.min(imageIndex, Math.max(product.images.length - 1, 0))}
          onSelect={setImageIndex}
          title={product.title}
        />
      </div>

      <div
        className={`flex flex-col gap-6 ${stickyInfo ? "lg:sticky lg:top-28 lg:self-start" : ""}`}
      >
        {blocks.map((b) => {
          const el = renderBlock(b);
          return el ? (
            <div key={b.id} data-cf-block={b.id}>
              {el}
            </div>
          ) : null;
        })}
        {!blocks.some((b) => b.type === "title") && <h1 className="sr-only">{product.title}</h1>}
      </div>
    </div>
  );
}

function ShareLinks({ title }: { title: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(window.location.href.split("?")[0]!), []);
  if (!url) return null;
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return (
    <p className="flex flex-wrap items-center gap-4 text-sm">
      <span className="text-muted">Share:</span>
      <a
        className="sf-link"
        href={`https://wa.me/?text=${t}%20${u}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        WhatsApp
      </a>
      <a
        className="sf-link"
        href={`https://www.facebook.com/sharer/sharer.php?u=${u}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Facebook
      </a>
      <a
        className="sf-link"
        href={`https://x.com/intent/post?url=${u}&text=${t}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        X
      </a>
    </p>
  );
}
