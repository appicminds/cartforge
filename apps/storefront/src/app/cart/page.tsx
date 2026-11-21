import type { Metadata } from "next";
import Link from "next/link";
import { removeLine, startCheckout, updateLine } from "@/app/actions/cart";
import { CartNotices } from "@/components/cart-notices";
import { SubmitButton } from "@/components/submit-button";
import { storefront } from "@/lib/api";
import { currentCart } from "@/lib/commerce";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Your cart", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CartPage({ searchParams }: Props) {
  const [found, store, sp] = await Promise.all([currentCart(), storefront.store(), searchParams]);
  const error = typeof sp.error === "string" ? sp.error.slice(0, 300) : null;
  const cart = found?.cart;
  const money = (m: number) => formatMoney(m, cart?.currency ?? store.currency, store.locale);

  if (!cart || cart.lines.length === 0) {
    return (
      <div className="sf-container flex flex-col items-center py-24 text-center">
        <h1 className="text-3xl md:text-5xl">Your cart is empty</h1>
        {cart && (
          <div className="mt-6 w-full max-w-xl text-left">
            <CartNotices notices={cart.notices} />
          </div>
        )}
        <p className="mt-4 text-muted">Find something you love — it’ll wait for you here.</p>
        <Link href="/products" className="sf-button mt-8">
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="sf-container py-10 md:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl md:text-5xl">Your cart</h1>
        <Link href="/products" className="sf-link text-sm">
          Continue shopping
        </Link>
      </div>
      <div className="mt-6 space-y-4">
        {error && (
          <p
            role="alert"
            className="rounded-[var(--sf-radius)] border border-sale p-4 text-sm text-sale"
          >
            {error}
          </p>
        )}
        <CartNotices notices={cart.notices} />
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="items-heading">
          <h2 id="items-heading" className="sr-only">
            Items
          </h2>
          <ul className="divide-y divide-line border-y border-line">
            {cart.lines.map((l) => (
              <li key={l.id} className="flex gap-4 py-6">
                <div className="h-24 w-20 shrink-0 overflow-hidden rounded-[calc(var(--sf-radius)/2)] bg-surface sm:h-32 sm:w-28">
                  {l.image && (
                    <img
                      src={l.image.url}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-body text-base font-medium">
                      <Link href={`/products/${l.product_handle}`} className="hover:underline">
                        {l.product_title}
                      </Link>
                    </h3>
                    {l.options.length > 0 && (
                      <p className="text-sm text-muted">
                        {l.options.map((o) => `${o.option}: ${o.value}`).join(" · ")}
                      </p>
                    )}
                    <p className="mt-1 text-sm">{money(l.unit_price_minor)}</p>
                    {!l.available && <p className="mt-1 text-sm font-medium text-sale">Sold out</p>}
                  </div>
                  <div className="flex items-center gap-4 sm:flex-col sm:items-end">
                    <form
                      action={updateLine}
                      className="flex items-center rounded-[var(--sf-radius)] border border-line"
                    >
                      <input type="hidden" name="line_id" value={l.id} />
                      <button
                        type="submit"
                        name="quantity"
                        value={l.quantity - 1}
                        className="h-10 w-10 text-lg"
                        aria-label={`Decrease quantity of ${l.product_title}`}
                      >
                        −
                      </button>
                      <span
                        className="w-8 text-center"
                        aria-label={`Quantity of ${l.product_title}`}
                      >
                        {l.quantity}
                      </span>
                      <button
                        type="submit"
                        name="quantity"
                        value={l.quantity + 1}
                        disabled={l.max_quantity !== null && l.quantity >= l.max_quantity}
                        className="h-10 w-10 text-lg disabled:opacity-40"
                        aria-label={`Increase quantity of ${l.product_title}`}
                      >
                        +
                      </button>
                    </form>
                    <p className="font-medium sm:text-right">{money(l.line_total_minor)}</p>
                    <form action={removeLine}>
                      <input type="hidden" name="line_id" value={l.id} />
                      <button type="submit" className="sf-link text-sm text-muted hover:text-ink">
                        Remove<span className="sr-only"> {l.product_title}</span>
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside
          aria-labelledby="summary-heading"
          className="h-fit rounded-[var(--sf-radius)] bg-surface p-6 lg:sticky lg:top-28"
        >
          <h2 id="summary-heading" className="font-body text-lg font-semibold">
            Order summary
          </h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>
                Subtotal ({cart.item_count} {cart.item_count === 1 ? "item" : "items"})
              </dt>
              <dd className="font-medium" data-testid="cart-subtotal">
                {money(cart.subtotal_minor)}
              </dd>
            </div>
            {cart.discounts.map((d) => (
              <div key={d.title} className="flex justify-between text-sale">
                <dt>{d.title}</dt>
                <dd className="font-medium">−{money(d.amount_minor)}</dd>
              </div>
            ))}
            {cart.discount_minor > 0 && (
              <div className="flex justify-between border-t border-line pt-2 text-base">
                <dt className="font-semibold">Total</dt>
                <dd className="font-semibold" data-testid="cart-total">
                  {money(cart.subtotal_minor - cart.discount_minor)}
                </dd>
              </div>
            )}
          </dl>
          <p className="mt-2 text-sm text-muted">Shipping and taxes are calculated at checkout.</p>
          <form action={startCheckout} className="mt-6">
            <SubmitButton
              className="sf-button w-full"
              disabled={!cart.ready}
              pendingLabel="Starting checkout…"
            >
              Check out
            </SubmitButton>
          </form>
          {!cart.ready && (
            <p className="mt-3 text-sm text-sale">Remove sold-out items to check out.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
