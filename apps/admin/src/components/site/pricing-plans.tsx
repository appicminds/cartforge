"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { BETA, PLANS, YEARLY_DISCOUNT } from "@/lib/site/plans";
import { SIGNUP_URL } from "@/lib/site/site";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n % 1 ? 2 : 0,
  }).format(n);

/** Plan cards with a monthly / yearly switch. */
export function PricingPlans() {
  const [yearly, setYearly] = useState(true);
  return (
    <div className="flex flex-col items-center gap-10">
      <div
        role="radiogroup"
        aria-label="Billing"
        className="inline-flex rounded-full border border-white/15 bg-ink-2 p-1 shadow-lg"
      >
        {[
          [false, "Monthly"],
          [true, `Yearly (save ${Math.round(YEARLY_DISCOUNT * 100)}%)`],
        ].map(([value, label]) => (
          <button
            key={String(value)}
            type="button"
            role="radio"
            aria-checked={yearly === value}
            onClick={() => setYearly(value as boolean)}
            className={`rounded-full px-5 py-2 text-sm font-semibold ${yearly === value ? "bg-white text-ink" : "text-fg-inverse hover:bg-white/10"}`}
          >
            {label as string}
          </button>
        ))}
      </div>
      <ul className="grid w-full gap-6 lg:grid-cols-3">
        {PLANS.map((p) => {
          const price = yearly ? Math.round(p.monthly * (1 - YEARLY_DISCOUNT)) : p.monthly;
          return (
            <li
              key={p.key}
              className={`relative flex flex-col gap-6 rounded-3xl border p-8 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.45)] ${p.highlight ? "border-ink bg-ink text-fg-inverse lg:-translate-y-4" : "border-line bg-paper"}`}
            >
              {p.highlight && (
                <p className="absolute -top-3 left-8 rounded-full bg-ember px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">
                  Most popular
                </p>
              )}
              <div>
                <h2 className="text-2xl font-semibold">{p.name}</h2>
                <p
                  className={`mt-2 min-h-12 ${p.highlight ? "text-fg-inverse-muted" : "text-fg-muted"}`}
                >
                  {p.blurb}
                </p>
              </div>
              <div>
                <p className="flex items-baseline gap-2">
                  <span
                    className={`font-display text-5xl font-semibold ${BETA ? "text-fg-muted line-through decoration-2" : ""}`}
                  >
                    {money(price)}
                  </span>
                  <span className={p.highlight ? "text-fg-inverse-muted" : "text-fg-muted"}>
                    USD / month
                  </span>
                </p>
                <p
                  className={`mt-1 text-sm ${p.highlight ? "text-fg-inverse-muted" : "text-fg-muted"}`}
                >
                  {BETA ? (
                    <strong className={p.highlight ? "text-ember-bright" : "text-ember"}>
                      Free during beta
                    </strong>
                  ) : yearly ? (
                    `Billed yearly (${money(price * 12)})`
                  ) : (
                    "Billed monthly"
                  )}
                </p>
              </div>
              <a
                href={SIGNUP_URL}
                className={`rounded-full px-6 py-3 text-center font-semibold ${p.highlight ? "bg-ember text-white hover:bg-ember-hover" : "border border-ink hover:bg-ink hover:text-white"}`}
              >
                Start for free
              </a>
              <ul
                className={`flex flex-col gap-3 border-t pt-6 ${p.highlight ? "border-white/10" : "border-line"}`}
              >
                {p.features.map((f) => (
                  <li key={f} className="flex gap-3 text-[15px]">
                    <Check
                      aria-hidden
                      className={`mt-0.5 size-5 shrink-0 ${p.highlight ? "text-ember-bright" : "text-ember"}`}
                    />
                    {f}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
