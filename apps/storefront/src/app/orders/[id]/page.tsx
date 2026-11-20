import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { storefront } from "@/lib/api";
import { commerce } from "@/lib/commerce";
import type { CommerceAddress } from "@/lib/commerce-types";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = {
  title: "Order confirmed",
  robots: { index: false, follow: false, nocache: true },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PAYMENT_STATUS: Record<string, string> = {
  pending: "Awaiting payment",
  authorized: "Payment authorized",
  paid: "Paid",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
  voided: "Voided",
  failed: "Payment failed",
};

function Address({ a, locale }: { a: CommerceAddress; locale?: string }) {
  const country =
    new Intl.DisplayNames([locale ?? "en"], { type: "region" }).of(a.country) ?? a.country;
  return (
    <address className="not-italic leading-relaxed">
      {[a.first_name, a.last_name].filter(Boolean).join(" ")}
      <br />
      {a.company && (
        <>
          {a.company}
          <br />
        </>
      )}
      {a.address1}
      {a.address2 && `, ${a.address2}`}
      <br />
      {[a.city, a.region, a.postal_code].filter(Boolean).join(", ")}
      <br />
      {country}
    </address>
  );
}

/** Order status page, reachable only with the secret key from checkout (PRD §13.2, §16). */
export default async function OrderPage({ params, searchParams }: Props) {
  const { id } = await params;
  const raw = (await searchParams).key;
  const key = Array.isArray(raw) ? raw[0] : raw;
  if (!key) notFound();
  const [r, store] = await Promise.all([commerce.order(id, key), storefront.store()]);
  if (!r.ok) notFound();
  const o = r.data;
  const money = (m: number) => formatMoney(m, o.currency, store.locale);
  const name = o.shipping_address?.first_name ?? o.billing_address?.first_name;
  const t = o.totals;
  return (
    <div className="sf-container max-w-4xl py-10 md:py-16">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <div>
          <p className="text-sm text-muted">Order #{o.number}</p>
          <h1 className="text-3xl md:text-4xl">Thank you{name ? `, ${name}` : ""}!</h1>
          <p className="mt-2 text-muted">
            Your order is confirmed. {o.email && <>We’ll send updates to {o.email}.</>}
          </p>
        </div>
      </div>

      {o.payment && (
        <section
          aria-labelledby="pay-h"
          className="mt-8 rounded-[var(--sf-radius)] border border-line p-6"
        >
          <h2 id="pay-h" className="font-body text-lg font-semibold">
            {o.payment.label} · {PAYMENT_STATUS[o.payment_status] ?? o.payment_status}
          </h2>
          {o.payment.instructions && (
            <p className="mt-2 whitespace-pre-line text-sm" data-testid="payment-instructions">
              {o.payment.instructions}
            </p>
          )}
          <p className="mt-2 text-sm text-muted">Amount: {money(t.total_minor)}</p>
        </section>
      )}

      <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="items-h">
          <h2 id="items-h" className="font-body text-lg font-semibold">
            Items
          </h2>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {o.lines.map((l) => (
              <li key={l.id} className="flex justify-between gap-4 py-4 text-sm">
                <div>
                  <p className="font-medium">{l.product_title}</p>
                  {l.variant_title && <p className="text-muted">{l.variant_title}</p>}
                  <p className="text-muted">
                    {l.quantity} × {money(l.unit_price_minor)}
                  </p>
                </div>
                <p>{money(l.line_total_minor)}</p>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{money(t.subtotal_minor)}</dd>
            </div>
            {o.shipping_method && (
              <div className="flex justify-between">
                <dt>Shipping ({o.shipping_method.name})</dt>
                <dd>{t.shipping_minor ? money(t.shipping_minor) : "Free"}</dd>
              </div>
            )}
            {t.tax_minor > 0 && !t.prices_include_tax && (
              <div className="flex justify-between">
                <dt>{t.tax_label}</dt>
                <dd>{money(t.tax_minor)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
              <dt>Total</dt>
              <dd>{money(t.total_minor)}</dd>
            </div>
            {t.prices_include_tax && t.tax_minor > 0 && (
              <p className="text-muted">
                Including {money(t.tax_minor)} {t.tax_label.toLowerCase()}
              </p>
            )}
          </dl>
        </section>
        <section aria-label="Addresses" className="flex flex-col gap-6 text-sm">
          {o.shipping_address && (
            <div>
              <h2 className="mb-2 font-body text-base font-semibold">Shipping address</h2>
              <Address a={o.shipping_address} locale={store.locale} />
            </div>
          )}
          {o.billing_address && (
            <div>
              <h2 className="mb-2 font-body text-base font-semibold">Billing address</h2>
              <Address a={o.billing_address} locale={store.locale} />
            </div>
          )}
        </section>
      </div>
      <p className="mt-6 text-sm text-muted">
        Keep this page’s link to check your order later — it’s private to you.
      </p>
      <Link href="/products" className="sf-button mt-8">
        Continue shopping
      </Link>
    </div>
  );
}
