"use client";

import Image from "next/image";
import { useState } from "react";

const TABS = [
  {
    key: "editor",
    label: "Store builder",
    src: "/site/shots/editor.webp",
    w: 2400,
    h: 1350,
    alt: "The theme editor: sections on the left and a live preview of the store",
  },
  {
    key: "products",
    label: "Products",
    src: "/site/shots/products.webp",
    w: 2000,
    h: 1250,
    alt: "Products with pictures, variants, stock and prices",
  },
  {
    key: "orders",
    label: "Orders",
    src: "/site/shots/orders.webp",
    w: 2000,
    h: 1250,
    alt: "Orders with payment and fulfillment status",
  },
  {
    key: "markets",
    label: "Markets",
    src: "/site/shots/markets.webp",
    w: 2000,
    h: 1250,
    alt: "Markets with their own currencies and payment methods",
  },
] as const;

/** A tabbed look at the admin: one big, sharp screen at a time. */
export function Showcase() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("editor");
  const current = TABS.find((t) => t.key === tab)!;
  return (
    <div className="flex flex-col items-center gap-8">
      <div
        role="tablist"
        aria-label="Parts of CartForge"
        className="flex flex-wrap justify-center gap-2"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls="showcase-panel"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-5 py-2.5 text-[15px] font-semibold transition-colors ${tab === t.key ? "bg-white text-ink" : "bg-white/10 text-fg-inverse hover:bg-white/15"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        id="showcase-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="w-full overflow-hidden rounded-2xl border border-white/10 bg-ink-2 shadow-[0_40px_120px_-30px_rgb(0_0_0/0.8)] sm:rounded-3xl"
      >
        <Image
          key={current.key}
          src={current.src}
          alt={current.alt}
          width={current.w}
          height={current.h}
          sizes="(min-width: 1280px) 1200px, 100vw"
          className="block h-auto w-full"
        />
      </div>
    </div>
  );
}
