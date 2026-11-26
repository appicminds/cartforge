import type { Metadata } from "next";
import { PricingPlans } from "@/components/pricing-plans";
import { SignupForm } from "@/components/signup-form";
import { BETA, COMPARISON, PLANS, PRICING_FAQ } from "@/lib/plans";
import { Check, Minus } from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple plans for every stage of your business. Free during the CartForge beta.",
  alternates: { canonical: "/pricing" },
};

export default function Pricing() {
  return (
    <>
      <section className="bg-paper-2 pb-20 pt-16 sm:pt-24">
        <div className="container-x flex flex-col items-center gap-5 text-center">
          <h1 className="max-w-3xl text-5xl font-semibold sm:text-6xl">Pick the plan that fits</h1>
          <p className="max-w-2xl text-lg text-fg-muted">
            {BETA
              ? "Every plan is free while CartForge is in beta. Try everything; choose a plan when billing starts."
              : "Start with what you need today and change plans any time."}
          </p>
        </div>
        <div className="container-x mt-12">
          <PricingPlans />
        </div>
      </section>

      <section className="bg-paper py-20" aria-labelledby="compare">
        <div className="container-x">
          <h2 id="compare" className="text-3xl font-semibold sm:text-4xl">
            Compare plans
          </h2>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[640px] border-collapse text-left text-[15px]">
              <thead>
                <tr className="bg-paper-2">
                  <th scope="col" className="w-2/5 p-4 font-semibold">
                    <span className="sr-only">Feature</span>
                  </th>
                  {PLANS.map((p) => (
                    <th key={p.key} scope="col" className="p-4 font-semibold">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              {COMPARISON.map((g) => (
                <tbody key={g.group}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={PLANS.length + 1}
                      className="border-t border-line bg-paper px-4 pb-2 pt-6 font-display text-lg font-semibold"
                    >
                      {g.group}
                    </th>
                  </tr>
                  {g.rows.map(([label, ...cells]) => (
                    <tr key={label} className="border-t border-line">
                      <th scope="row" className="p-4 font-normal text-fg-muted">
                        {label}
                      </th>
                      {cells.map((c, i) => (
                        <td key={i} className="p-4">
                          {c === true ? (
                            <Check aria-label="Included" className="size-5 text-ember" />
                          ) : c === false ? (
                            <Minus aria-label="Not included" className="size-5 text-fg-muted/60" />
                          ) : (
                            c
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </div>
      </section>

      <section className="bg-paper-2 py-20" aria-labelledby="faq">
        <div className="container-x grid gap-10 lg:grid-cols-[1fr_2fr]">
          <h2 id="faq" className="text-3xl font-semibold sm:text-4xl">
            Questions about pricing
          </h2>
          <div className="divide-y divide-line border-y border-line">
            {PRICING_FAQ.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                  {f.q}
                  <span
                    aria-hidden
                    className="text-2xl leading-none text-fg-muted transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl text-fg-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-ink py-20 text-fg-inverse">
        <div aria-hidden className="glow pointer-events-none absolute inset-0" />
        <div className="container-x relative flex flex-col items-center gap-6 text-center">
          <h2 className="text-4xl font-semibold sm:text-5xl">Start building today</h2>
          <SignupForm id="pricing-email" />
        </div>
      </section>
    </>
  );
}
