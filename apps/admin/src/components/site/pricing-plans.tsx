"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { BETA, LICENSE, PLANS, YEARLY_DISCOUNT } from "@/lib/site/plans";
import { EDITIONS, LICENSE_URL, SIGNUP_URL } from "@/lib/site/site";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n % 1 ? 2 : 0,
  }).format(n);

const pillLight = (on: boolean) =>
  `rounded-full px-5 py-2 text-sm font-semibold ${on ? "bg-ink text-white" : "text-fg hover:bg-paper-2"}`;
const pill = (on: boolean) =>
  `rounded-full px-5 py-2 text-sm font-semibold ${on ? "bg-white text-ink" : "text-fg-inverse hover:bg-white/10"}`;

/**
 * Cloud plans (subscription, monthly / yearly) or the self-hosted license
 * (one-time). "#self-hosted" in the address opens the license.
 */
export function PricingPlans() {
  const [edition, setEdition] = useState<"cloud" | "self">("cloud");
  const [yearly, setYearly] = useState(true);
  useEffect(() => {
    const sync = () => window.location.hash === "#self-hosted" && setEdition("self");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return (
    <div id="self-hosted" className="flex scroll-mt-24 flex-col items-center gap-6">
      <div
        role="tablist"
        aria-label="How you run CartForge"
        className="inline-flex rounded-full border border-white/15 bg-ink-2 p-1 shadow-lg"
      >
        <button
          type="button"
          role="tab"
          id="tab-cloud"
          aria-selected={edition === "cloud"}
          aria-controls="plans-panel"
          onClick={() => setEdition("cloud")}
          className={pill(edition === "cloud")}
        >
          Cloud · subscription
        </button>
        <button
          type="button"
          role="tab"
          id="tab-self"
          aria-selected={edition === "self"}
          aria-controls="plans-panel"
          onClick={() => setEdition("self")}
          className={pill(edition === "self")}
        >
          Self-hosted · one time
        </button>
      </div>
      <div
        id="plans-panel"
        role="tabpanel"
        aria-labelledby={edition === "cloud" ? "tab-cloud" : "tab-self"}
        className="flex w-full flex-col items-center gap-10"
      >
        {edition === "cloud" ? <CloudPlans yearly={yearly} setYearly={setYearly} /> : <License />}
      </div>
    </div>
  );
}

function License() {
  return (
    <div className="grid w-full max-w-5xl gap-6 pt-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="flex flex-col gap-6 rounded-3xl bg-ink p-8 text-fg-inverse shadow-[0_30px_80px_-40px_rgb(0_0_0/0.6)] sm:p-10">
        <div>
          <h2 className="text-2xl font-semibold">{LICENSE.name}</h2>
          <p className="mt-2 text-fg-inverse-muted">{LICENSE.blurb}</p>
        </div>
        <p className="flex items-baseline gap-2">
          <span className="font-display text-6xl font-semibold tracking-tight">
            {money(LICENSE.price)}
          </span>
          <span className="text-fg-inverse-muted">USD, one time</span>
        </p>
        <a
          href={LICENSE_URL === "/pricing#self-hosted" ? "/self-hosted" : LICENSE_URL}
          className="rounded-full bg-ember px-6 py-3 text-center font-semibold text-white hover:bg-ember-hover"
        >
          Get a license
        </a>
        <ul className="flex flex-col gap-3 border-t border-white/10 pt-6">
          {LICENSE.features.map((f) => (
            <li key={f} className="flex gap-3 text-[15px]">
              <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-ember-bright" />
              {f}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-6 rounded-3xl border border-line bg-paper p-8 sm:p-10">
        <h2 className="font-display text-3xl font-semibold leading-tight">
          {EDITIONS.selfHosted.tagline}
        </h2>
        <ul className="flex flex-col gap-3">
          {EDITIONS.selfHosted.points.map((p) => (
            <li key={p} className="flex gap-3 text-lg">
              <Check aria-hidden className="mt-1 size-5 shrink-0 text-ember" /> {p}
            </li>
          ))}
        </ul>
        <Link
          href="/self-hosted"
          className="mt-auto inline-flex w-fit items-center gap-2 font-semibold text-ember hover:text-ember-hover"
        >
          What you need and how it works <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </div>
  );
}

function CloudPlans({ yearly, setYearly }: { yearly: boolean; setYearly: (v: boolean) => void }) {
  return (
    <>
      <div
        role="radiogroup"
        aria-label="Billing"
        className="inline-flex rounded-full border border-line bg-paper p-1"
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
            className={pillLight(yearly === value)}
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
                    className={`font-display text-5xl font-semibold tracking-tight ${BETA ? `line-through decoration-2 ${p.highlight ? "text-fg-inverse-muted" : "text-fg-muted"}` : ""}`}
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
    </>
  );
}
