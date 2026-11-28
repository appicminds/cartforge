import Link from "next/link";
import { ArrowRight, Check, Cloud, Server } from "lucide-react";
import { BETA, LICENSE, PLANS } from "@/lib/site/plans";
import { EDITIONS, SIGNUP_URL } from "@/lib/site/site";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/** Cloud (subscription) and Self-hosted (one-time license), side by side. */
export function Editions() {
  const cloud = EDITIONS.cloud;
  const own = EDITIONS.selfHosted;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <article className="reveal flex flex-col gap-8 rounded-3xl bg-paper p-8 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.35)] sm:p-10">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-ember-soft text-ember">
            <Cloud aria-hidden className="size-6" />
          </span>
          <div>
            <h3 className="text-2xl font-semibold">{cloud.name}</h3>
            <p className="text-sm font-semibold uppercase tracking-wider text-ember">
              {cloud.model}
            </p>
          </div>
        </div>
        <p className="font-display text-3xl font-semibold leading-tight">{cloud.tagline}</p>
        <ul className="flex flex-col gap-3">
          {cloud.points.map((p) => (
            <li key={p} className="flex gap-3 text-lg">
              <Check aria-hidden className="mt-1 size-5 shrink-0 text-ember" /> {p}
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-6">
          <p>
            <span className="font-display text-2xl font-semibold">
              From {money(PLANS[0]!.monthly)}
            </span>
            <span className="text-fg-muted"> / month</span>
            {BETA && (
              <span className="block text-sm font-semibold text-ember">Free during beta</span>
            )}
          </p>
          <a
            href={SIGNUP_URL}
            className="ml-auto inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 font-semibold text-white hover:bg-ink-3"
          >
            Start for free <ArrowRight aria-hidden className="size-4" />
          </a>
        </div>
      </article>
      <article className="reveal flex flex-col gap-8 rounded-3xl bg-ink p-8 text-fg-inverse shadow-[0_30px_80px_-40px_rgb(0_0_0/0.6)] sm:p-10">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-white/10 text-ember-bright">
            <Server aria-hidden className="size-6" />
          </span>
          <div>
            <h3 className="text-2xl font-semibold">{own.name}</h3>
            <p className="text-sm font-semibold uppercase tracking-wider text-ember-bright">
              {own.model}
            </p>
          </div>
        </div>
        <p className="font-display text-3xl font-semibold leading-tight">{own.tagline}</p>
        <ul className="flex flex-col gap-3">
          {own.points.map((p) => (
            <li key={p} className="flex gap-3 text-lg">
              <Check aria-hidden className="mt-1 size-5 shrink-0 text-ember-bright" /> {p}
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/10 pt-6">
          <p>
            <span className="font-display text-2xl font-semibold">{money(LICENSE.price)}</span>
            <span className="text-fg-inverse-muted"> one time</span>
          </p>
          <Link
            href="/self-hosted"
            className="ml-auto inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-ink hover:bg-paper-2"
          >
            Explore self-hosted <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </article>
    </div>
  );
}
