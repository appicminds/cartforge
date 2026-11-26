import { Check, Lock, ShoppingBag, Truck } from "lucide-react";

/**
 * Product UI drawn in code (sharp at any size). The figures are illustrations of
 * what the admin shows, not claims about real stores.
 */

const card =
  "rounded-2xl border border-black/5 bg-white text-fg shadow-[0_24px_60px_-20px_rgb(0_0_0/0.45)]";

export function OrderCard({ className = "" }: { className?: string }) {
  return (
    <div className={`${card} flex w-80 items-center gap-3 p-4 ${className}`}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ember-soft text-ember">
        <ShoppingBag aria-hidden className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-fg-muted">New order · just now</p>
        <p className="whitespace-nowrap font-semibold">#1042 · Mariam A.</p>
      </div>
      <p className="ml-auto font-display text-lg font-semibold">$129.00</p>
    </div>
  );
}

export function SalesCard({ className = "" }: { className?: string }) {
  return (
    <div className={`${card} w-80 p-5 ${className}`}>
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-fg-muted">Total sales</p>
        <p className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
          +18.2%
        </p>
      </div>
      <p className="mt-1 font-display text-3xl font-semibold tracking-tight">$12,480.50</p>
      <svg viewBox="0 0 280 80" className="mt-3 h-20 w-full" aria-hidden>
        <defs>
          <linearGradient id="sales-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#c2410c" stopOpacity="0.25" />
            <stop offset="1" stopColor="#c2410c" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 62 C 25 58, 35 50, 55 52 S 90 40, 110 44 S 145 30, 165 34 S 200 18, 220 22 S 255 8, 280 6 L 280 80 L 0 80 Z"
          fill="url(#sales-fill)"
        />
        <path
          d="M0 62 C 25 58, 35 50, 55 52 S 90 40, 110 44 S 145 30, 165 34 S 200 18, 220 22 S 255 8, 280 6"
          fill="none"
          stroke="#c2410c"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="280" cy="6" r="4" fill="#c2410c" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-fg-muted">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
    </div>
  );
}

export function ShippedCard({ className = "" }: { className?: string }) {
  return (
    <div className={`${card} flex w-64 items-center gap-3 p-4 ${className}`}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        <Truck aria-hidden className="size-5" />
      </span>
      <div>
        <p className="font-semibold">Order shipped</p>
        <p className="text-xs text-fg-muted">Customer notified by email</p>
      </div>
    </div>
  );
}

const METHODS: [string, string][] = [
  ["Card", "Visa •••• 4242"],
  ["Mobile wallet", "Paid in app"],
  ["Bank transfer", "Marked paid"],
  ["Cash on delivery", "Collected"],
];

export function PaymentsCard({ className = "" }: { className?: string }) {
  return (
    <div className={`${card} w-full max-w-sm p-2 ${className}`}>
      <ul className="divide-y divide-line">
        {METHODS.map(([m, d]) => (
          <li key={m} className="flex items-center gap-3 px-3 py-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-paper-2 text-xs font-bold text-fg-muted">
              {m.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{m}</span>
              <span className="block text-xs text-fg-muted">{d}</span>
            </span>
            <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              Paid
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const PRICES: [string, string][] = [
  ["USD", "$66.99"],
  ["GBP", "£52.99"],
  ["EUR", "€61.99"],
  ["AED", "AED 245"],
];

export function CurrencyCard({ className = "" }: { className?: string }) {
  return (
    <div className={`${card} w-full max-w-sm p-5 ${className}`}>
      <p className="text-sm text-fg-muted">Midnight Velvet Abaya</p>
      <p className="mt-1 font-display text-3xl font-semibold">£52.99</p>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {PRICES.map(([c, p]) => (
          <span
            key={c}
            className={`rounded-xl border px-2 py-2 text-center ${c === "GBP" ? "border-ink bg-ink text-white" : "border-line"}`}
          >
            <span className="block text-xs font-semibold">{c}</span>
            <span
              className={`block text-[11px] ${c === "GBP" ? "text-white/70" : "text-fg-muted"}`}
            >
              {p}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function DiscountCard({ className = "" }: { className?: string }) {
  return (
    <div className={`${card} w-full max-w-sm p-5 ${className}`}>
      <div className="flex gap-2">
        <span className="flex-1 rounded-xl border border-line px-3 py-2.5 font-mono text-sm tracking-wider">
          EID20
        </span>
        <span className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white">
          Apply
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
          <Check aria-hidden className="size-4" /> 20% off applied
        </span>
        <span className="font-semibold">−$24.00</span>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <span className="text-sm text-fg-muted">Total</span>
        <span className="font-display text-xl font-semibold">$96.00</span>
      </div>
    </div>
  );
}

export function SecurityCard({ className = "" }: { className?: string }) {
  return (
    <div className={`${card} w-full max-w-sm p-5 ${className}`}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Lock aria-hidden className="size-4 text-ember" /> Two-step sign-in
      </p>
      <div className="mt-4 flex gap-2">
        {["4", "8", "2", "9", "1", "6"].map((d, i) => (
          <span
            key={i}
            className="flex h-12 flex-1 items-center justify-center rounded-xl border border-line font-display text-xl font-semibold"
          >
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}
