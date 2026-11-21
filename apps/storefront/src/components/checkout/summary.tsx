import type { CheckoutView } from "@/lib/commerce-types";
import { formatMoney } from "@/lib/money";
import { DiscountForm } from "./discount-form";

export function OrderSummary({ view, locale }: { view: CheckoutView; locale?: string }) {
  const money = (m: number) => formatMoney(m, view.cart.currency, locale);
  const t = view.totals;
  const rate = t.tax_rate_bps ? ` (${(t.tax_rate_bps / 100).toLocaleString(locale)}%)` : "";
  return (
    <section aria-labelledby="summary-h" className="rounded-[var(--sf-radius)] bg-surface p-6">
      <h2 id="summary-h" className="font-body text-lg font-semibold">
        Order summary
      </h2>
      <ul className="mt-4 divide-y divide-line">
        {view.cart.lines.map((l) => (
          <li key={l.id} className="flex items-center gap-3 py-3">
            <div className="relative h-16 w-14 shrink-0 rounded-[calc(var(--sf-radius)/2)] bg-bg">
              {l.image && (
                <img
                  src={l.image.url}
                  alt=""
                  className="h-full w-full rounded-[calc(var(--sf-radius)/2)] object-cover"
                />
              )}
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-[11px] font-semibold text-white">
                <span className="sr-only">Quantity </span>
                {l.quantity}
              </span>
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">{l.product_title}</p>
              {l.variant_title && <p className="text-muted">{l.variant_title}</p>}
            </div>
            <p className="text-sm">{money(l.line_total_minor)}</p>
          </li>
        ))}
      </ul>
      <DiscountForm code={view.discount_code} note={view.discount_note} />
      <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd>{money(t.subtotal_minor)}</dd>
        </div>
        {view.discounts.map((d) => (
          <div key={d.id} className="flex justify-between" data-testid="checkout-discount">
            <dt>
              {d.kind === "shipping" ? "Free shipping" : "Discount"}
              <span className="text-muted"> · {d.code ?? d.title}</span>
            </dt>
            <dd>−{money(d.amount_minor)}</dd>
          </div>
        ))}
        {view.shipping_required && (
          <div className="flex justify-between">
            <dt>Shipping</dt>
            <dd>
              {t.shipping_minor === null ? (
                <span className="text-muted">Calculated at next step</span>
              ) : t.shipping_minor + t.shipping_discount_minor === 0 ? (
                "Free"
              ) : (
                // Before a free-shipping discount, which is listed above.
                money(t.shipping_minor + t.shipping_discount_minor)
              )}
            </dd>
          </div>
        )}
        {(t.tax_minor > 0 || t.tax_rate_bps > 0) && !t.prices_include_tax && (
          <div className="flex justify-between">
            <dt>
              {t.tax_label}
              {rate}
            </dt>
            <dd>{money(t.tax_minor)}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between border-t border-line pt-3 text-base">
          <dt className="font-semibold">Total</dt>
          <dd className="text-xl font-semibold" data-testid="checkout-total">
            <span className="mr-1 text-xs font-normal text-muted">{view.cart.currency}</span>
            {money(t.total_minor)}
          </dd>
        </div>
        {t.prices_include_tax && t.tax_minor > 0 && (
          <p className="text-muted">
            Including {money(t.tax_minor)} {t.tax_label.toLowerCase()}
            {rate}
          </p>
        )}
      </dl>
    </section>
  );
}
