import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Database,
  HardDrive,
  KeyRound,
  Layers,
  RefreshCw,
  Server,
  type LucideIcon,
} from "lucide-react";
import { EDITION_COMPARISON, LICENSE } from "@/lib/site/plans";
import { EDITIONS, LICENSE_URL, SIGNUP_URL } from "@/lib/site/site";

export const metadata: Metadata = {
  title: "Self-hosted",
  description:
    "Buy CartForge once and run your own standalone installation on your own server, with full control over infrastructure, data and deployment.",
  alternates: { canonical: "/self-hosted" },
};

const GET: [LucideIcon, string, string][] = [
  [
    Layers,
    "The complete platform",
    "Storefront, themes and editor, checkout, payments, orders, customers, markets and more.",
  ],
  [
    Server,
    "Your own installation",
    "A standalone CartForge that runs on infrastructure you choose.",
  ],
  [Database, "Your data, your database", "Everything lives in your own PostgreSQL database."],
  [KeyRound, "Pay once", "A one-time license instead of a monthly platform fee."],
  [
    RefreshCw,
    "Update on your schedule",
    "Install new versions when it suits you, not when it suits us.",
  ],
  [HardDrive, "Your storage", "Keep pictures on the server's disk or any S3-compatible storage."],
];

const NEEDS: [string, string][] = [
  ["Node.js 22", "Runs the store, the admin and the API"],
  ["PostgreSQL 16", "Stores products, orders, customers and settings"],
  ["Redis 7", "Keeps sessions and background work fast"],
  ["Storage", "The server's disk, or S3-compatible storage such as AWS S3, Cloudflare R2 or MinIO"],
  ["A domain and HTTPS", "Behind a reverse proxy such as Caddy or Nginx"],
];

const STEPS: [string, string][] = [
  ["Get a license", "Pay once and receive your copy of CartForge."],
  ["Install it", "Set it up on your server with the installation guide."],
  ["Create your store", "Make your admin account, pick a theme and add products."],
  ["Sell, on your terms", "Run it your way, and update when you're ready."],
];

const FAQ: [string, string][] = [
  [
    "What's the difference from CartForge Cloud?",
    "It's the same platform. With Cloud we host it, keep it updated and look after the servers, for a subscription. With Self-hosted you pay once and run it yourself, with full control over where and how it runs.",
  ],
  [
    "Do I need to be a developer?",
    "To run your store, no: the admin is the same simple one. To install and look after the server, you need someone comfortable with basic server administration, or a hosting partner.",
  ],
  ["What does the license include?", `${LICENSE.features.join(". ")}.`],
  [
    "Where is my data stored?",
    "In your own PostgreSQL database and your own storage, on infrastructure you choose. Nothing is stored with CartForge.",
  ],
  [
    "Can I accept the same payment methods?",
    "Yes. Cards through Stripe, local gateways and wallets, bank transfer and cash on delivery all work the same way.",
  ],
];

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

export default function SelfHosted() {
  const own = EDITIONS.selfHosted;
  return (
    <>
      <section className="relative overflow-hidden bg-ink text-fg-inverse">
        <div aria-hidden className="glow pointer-events-none absolute inset-0" />
        <div className="container-x relative flex flex-col gap-8 pb-24 pt-20 sm:pt-28">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-ember-bright">
            {own.name} · {own.model}
          </p>
          <h1 className="display-xl">
            <span className="block">Your server.</span>
            <span className="block text-ember-bright">Your platform.</span>
          </h1>
          <p className="lede max-w-2xl text-fg-inverse-muted">
            Buy CartForge once and run your own standalone installation, with full control over
            infrastructure, data and deployment. No monthly platform fee.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href={LICENSE_URL}
              className="inline-flex items-center gap-2 rounded-full bg-ember px-7 py-3.5 text-lg font-semibold text-white hover:bg-ember-hover"
            >
              Get a license · {money(LICENSE.price)} <ArrowRight aria-hidden className="size-5" />
            </a>
            <Link
              href="#compare"
              className="rounded-full border border-white/25 px-7 py-3.5 text-lg font-semibold text-white hover:bg-white/10"
            >
              Compare with Cloud
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-paper py-28">
        <div className="container-x flex flex-col gap-14">
          <div className="flex max-w-3xl flex-col gap-6">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-ember">
              What you get
            </p>
            <h2 className="display-lg">Everything CartForge does. On your terms.</h2>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {GET.map(([Icon, title, text]) => (
              <li key={title} className="reveal flex flex-col gap-3 bg-paper p-8">
                <span className="flex size-11 items-center justify-center rounded-xl bg-ember-soft text-ember">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="font-display text-xl font-semibold">{title}</span>
                <span className="text-fg-muted">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-paper-2 py-28">
        <div className="container-x grid gap-16 lg:grid-cols-2">
          <div className="flex flex-col gap-8">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-ember">
              How it works
            </p>
            <h2 className="display-lg">From license to live store</h2>
            <ol className="flex flex-col gap-6">
              {STEPS.map(([title, text], i) => (
                <li key={title} className="flex gap-5">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink font-display text-lg font-semibold text-white">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-xl font-semibold">{title}</span>
                    <span className="block text-lg text-fg-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-col gap-6 rounded-3xl bg-ink p-8 text-fg-inverse sm:p-10">
            <h2 className="text-3xl font-semibold">What you need</h2>
            <p className="text-fg-inverse-muted">
              A standard, well-known stack. Any Linux server or cloud provider will do.
            </p>
            <dl className="flex flex-col divide-y divide-white/10 border-y border-white/10">
              {NEEDS.map(([name, why]) => (
                <div key={name} className="flex flex-col gap-1 py-4 sm:flex-row sm:gap-6">
                  <dt className="font-mono text-ember-bright sm:w-44 sm:shrink-0">{name}</dt>
                  <dd className="text-fg-inverse-muted">{why}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section id="compare" className="scroll-mt-20 bg-paper py-28">
        <div className="container-x flex flex-col gap-12">
          <div className="flex max-w-3xl flex-col gap-6">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-ember">
              Cloud or self-hosted
            </p>
            <h2 className="display-lg">Pick what fits your business</h2>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[640px] border-collapse text-left text-[15px]">
              <thead>
                <tr className="bg-paper-2">
                  <th scope="col" className="w-1/4 p-4">
                    <span className="sr-only">Topic</span>
                  </th>
                  <th scope="col" className="p-4 font-display text-lg font-semibold">
                    {EDITIONS.cloud.name}
                  </th>
                  <th scope="col" className="p-4 font-display text-lg font-semibold">
                    {own.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {EDITION_COMPARISON.map(([topic, cloud, self]) => (
                  <tr key={topic} className="border-t border-line">
                    <th scope="row" className="p-4 font-normal text-fg-muted">
                      {topic}
                    </th>
                    <td className="p-4">{cloud}</td>
                    <td className="p-4">{self}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-4">
            <a
              href={SIGNUP_URL}
              className="rounded-full border border-ink px-6 py-3 font-semibold hover:bg-ink hover:text-white"
            >
              Start on Cloud for free
            </a>
            <a
              href={LICENSE_URL}
              className="rounded-full bg-ink px-6 py-3 font-semibold text-white hover:bg-ink-3"
            >
              Get a self-hosted license
            </a>
          </div>
        </div>
      </section>

      <section className="bg-paper-2 py-28" aria-labelledby="sh-faq">
        <div className="container-x grid gap-10 lg:grid-cols-[1fr_2fr]">
          <h2 id="sh-faq" className="display-lg">
            Questions
          </h2>
          <div className="divide-y divide-line border-y border-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                  {q}
                  <span
                    aria-hidden
                    className="text-2xl leading-none text-fg-muted transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl text-fg-muted">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-ink py-28 text-fg-inverse">
        <div aria-hidden className="glow pointer-events-none absolute inset-0" />
        <div className="container-x relative flex flex-col items-center gap-8 text-center">
          <h2 className="display-xl max-w-[14ch]">Own your commerce</h2>
          <ul className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-lg text-fg-inverse-muted">
            {own.points.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <Check aria-hidden className="size-5 text-ember-bright" /> {p}
              </li>
            ))}
          </ul>
          <a
            href={LICENSE_URL}
            className="inline-flex items-center gap-2 rounded-full bg-ember px-7 py-3.5 text-lg font-semibold text-white hover:bg-ember-hover"
          >
            Get a license · {money(LICENSE.price)} <ArrowRight aria-hidden className="size-5" />
          </a>
        </div>
      </section>
    </>
  );
}
