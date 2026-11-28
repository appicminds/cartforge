import { Check } from "lucide-react";

const MERCHANTS = [
  "Point-and-click editor: no code, ever",
  "Add a product with pictures, sizes and prices in minutes",
  "Plain words, not jargon, on every screen",
  "Works on your phone as well as your laptop",
];

const DEVELOPERS = [
  "REST API for products, orders, customers and more, with OpenAPI docs",
  "Custom HTML and CSS sections inside any theme",
  "A standard stack: Node.js, PostgreSQL, Redis, S3-compatible storage",
  "Self-host it: your server, your database, your deployment",
];

const K = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[#9fc7ff]">{children}</span>
);
const S = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[#f6b48c]">{children}</span>
);
const N = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[#b5e3a1]">{children}</span>
);

/** A request to the CartForge API (the response is trimmed to a few fields). */
function CodeSample() {
  const code = (
    <>
      <span className="text-[#8a8d96]">$</span> curl
      https://your-store.com/api/v1/storefront/products \{"\n"}
      {"    "}-H <S>&quot;X-Store-Id: $STORE_ID&quot;</S>
      {"\n\n"}
      {"{\n  "}
      <K>&quot;data&quot;</K>
      {": [{\n    "}
      <K>&quot;handle&quot;</K>: <S>&quot;midnight-velvet-abaya&quot;</S>
      {",\n    "}
      <K>&quot;title&quot;</K>: <S>&quot;Midnight Velvet Abaya&quot;</S>
      {",\n    "}
      <K>&quot;currency&quot;</K>: <S>&quot;USD&quot;</S>
      {",\n    "}
      <K>&quot;price_min_minor&quot;</K>: <N>6699</N>
      {",\n    "}
      <K>&quot;available&quot;</K>: <N>true</N>
      {"\n  }],\n  "}
      <K>&quot;meta&quot;</K>
      {": { "}
      <K>&quot;total&quot;</K>: <N>25</N>
      {" }\n}"}
    </>
  );
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0c0e] shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8)]">
      <div aria-hidden className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="ml-3 font-mono text-xs text-fg-inverse-muted">Terminal</span>
      </div>
      <pre
        tabIndex={0}
        aria-label="Example: listing products with the CartForge API"
        className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-[#e6e6e3]"
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Two audiences, one platform. */
export function Developers() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <article className="reveal flex flex-col gap-6 rounded-3xl bg-paper p-8 text-fg sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-ember">
          For merchants
        </p>
        <h3 className="text-3xl font-semibold sm:text-4xl">Simple enough for anyone</h3>
        <p className="text-lg text-fg-muted">
          You don&apos;t need a developer to open your store. If you can write an email, you can run
          CartForge.
        </p>
        <ul className="flex flex-col gap-3">
          {MERCHANTS.map((p) => (
            <li key={p} className="flex gap-3 text-lg">
              <Check aria-hidden className="mt-1 size-5 shrink-0 text-ember" /> {p}
            </li>
          ))}
        </ul>
      </article>
      <article className="reveal flex min-w-0 flex-col gap-6 rounded-3xl bg-ink p-8 text-fg-inverse sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-ember-bright">
          For developers
        </p>
        <h3 className="text-3xl font-semibold sm:text-4xl">Open enough for anything</h3>
        <ul className="flex flex-col gap-3">
          {DEVELOPERS.map((p) => (
            <li key={p} className="flex gap-3 text-lg">
              <Check aria-hidden className="mt-1 size-5 shrink-0 text-ember-bright" /> {p}
            </li>
          ))}
        </ul>
        <CodeSample />
      </article>
    </div>
  );
}
