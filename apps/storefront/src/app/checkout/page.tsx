import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { CartNotices } from "@/components/cart-notices";
import { InformationStep, PaymentStep, ShippingStep } from "@/components/checkout/steps";
import { OrderSummary } from "@/components/checkout/summary";
import { storefront } from "@/lib/api";
import { cartToken, commerce, currentCustomer } from "@/lib/commerce";
import type { CheckoutView, StorefrontCustomer } from "@/lib/commerce-types";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

type Step = "information" | "shipping" | "payment";
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The furthest step the shopper may be on, given what's filled in. */
function allowedStep(view: CheckoutView, wanted: Step): Step {
  const infoDone =
    !!view.email && (view.shipping_required ? !!view.shipping_address : !!view.billing_address);
  if (!infoDone) return "information";
  if (wanted === "information") return "information";
  if (!view.shipping_required) return "payment";
  if (wanted === "shipping" || !view.shipping_method_id) return "shipping";
  return "payment";
}

/** Fills an empty contact/address from the signed-in customer's profile. */
function prefill(view: CheckoutView, c: StorefrontCustomer | null): CheckoutView {
  if (!c) return view;
  const saved = c.addresses.find((a) => a.is_default)?.address ?? null;
  const key = view.shipping_required ? "shipping_address" : "billing_address";
  const allowed =
    !view.shipping_required ||
    !saved ||
    !view.shipping_countries ||
    view.shipping_countries.includes(saved.country);
  return {
    ...view,
    email: view.email ?? c.email,
    phone: view.phone ?? c.phone ?? saved?.phone ?? null,
    [key]: view[key] ?? (allowed ? saved : null),
  };
}

export default async function CheckoutPage({ searchParams }: Props) {
  const token = await cartToken();
  if (!token) redirect("/cart");
  // Opening (re)holds the stock for the store's reservation window.
  const [r, store, sp, customer] = await Promise.all([
    commerce.openCheckout(token),
    storefront.store(),
    searchParams,
    currentCustomer(),
  ]);
  if (!r.ok)
    redirect(
      r.code === "CART_EMPTY" || r.code === "CART_NOT_FOUND" || r.code === "CHECKOUT_COMPLETED"
        ? "/cart"
        : `/cart?error=${encodeURIComponent(r.message)}`,
    );
  const view = r.data;
  if (!view.cart.lines.length) redirect("/cart");

  const raw = typeof sp.step === "string" ? sp.step : "information";
  const step = allowedStep(
    view,
    (["information", "shipping", "payment"] as const).includes(raw as Step)
      ? (raw as Step)
      : "information",
  );
  const steps: { key: Step; label: string }[] = [
    { key: "information", label: "Information" },
    ...(view.shipping_required ? [{ key: "shipping" as const, label: "Shipping" }] : []),
    { key: "payment", label: "Payment" },
  ];
  const current = steps.findIndex((s) => s.key === step);
  // The store hasn't finished setting up: say so instead of a form that can't be completed.
  const closed =
    view.shipping_required && view.shipping_countries?.length === 0
      ? "This store isn’t shipping orders yet."
      : view.payment_options.length === 0
        ? "This store isn’t taking payments yet."
        : null;
  const holdUntil = view.reserved_until
    ? new Date(view.reserved_until).toLocaleTimeString(store.locale, {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="sf-container py-8 md:py-12">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-16">
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-3xl md:text-4xl">Checkout</h1>
            <nav aria-label="Checkout steps" className="mt-3 text-sm">
              <ol className="flex flex-wrap items-center gap-2">
                <li>
                  <Link href="/cart" className="sf-link text-muted">
                    Cart
                  </Link>
                </li>
                {steps.map((s, i) => (
                  <li key={s.key} className="flex items-center gap-2">
                    <span aria-hidden className="text-muted">
                      ›
                    </span>
                    {i < current ? (
                      <Link href={`/checkout?step=${s.key}`} className="sf-link text-muted">
                        {s.label}
                      </Link>
                    ) : (
                      <span
                        aria-current={i === current ? "step" : undefined}
                        className={i === current ? "font-semibold" : "text-muted"}
                      >
                        {s.label}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          </div>
          <CartNotices notices={view.cart.notices} />
          {!view.cart.ready && (
            <p
              role="alert"
              className="rounded-[var(--sf-radius)] border border-sale p-4 text-sm text-sale"
            >
              Some items can’t be bought right now.{" "}
              <Link href="/cart" className="sf-link">
                Review your cart
              </Link>
              .
            </p>
          )}
          {closed && (
            <div
              role="alert"
              className="rounded-[var(--sf-radius)] border border-line p-4 text-sm"
              data-testid="checkout-closed"
            >
              <p className="font-semibold">{closed}</p>
              <p className="mt-1 text-muted">
                Your cart is saved. Please check back soon
                {store.contact_email ? (
                  <>
                    {" "}
                    or{" "}
                    <a href={`mailto:${store.contact_email}`} className="sf-link">
                      contact {store.name}
                    </a>
                  </>
                ) : null}
                .
              </p>
            </div>
          )}
          {!closed && step === "information" && !customer && (
            <p className="text-sm">
              Have an account?{" "}
              <Link href="/account/login?next=/checkout" className="sf-link">
                Sign in
              </Link>{" "}
              to use your saved address.
            </p>
          )}
          {!closed && step === "information" && (
            <InformationStep view={prefill(view, customer)} locale={store.locale} />
          )}
          {!closed && step === "shipping" && <ShippingStep view={view} locale={store.locale} />}
          {!closed && step === "payment" && (
            <PaymentStep view={view} locale={store.locale} idempotencyKey={randomUUID()} />
          )}
        </div>
        <aside className="flex flex-col gap-3 lg:sticky lg:top-28 lg:self-start">
          <OrderSummary view={view} locale={store.locale} />
          {holdUntil && (
            <p className="text-sm text-muted">We’re holding your items until {holdUntil}.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
