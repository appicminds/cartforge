/**
 * Pricing plans shown on the site. Billing isn't live yet: every plan is free
 * during the beta. Prices are in US dollars; change them here.
 */
export const BETA = true;
/** Yearly billing discount (shown as "save 25%"). */
export const YEARLY_DISCOUNT = 0.25;

export interface Plan {
  key: string;
  name: string;
  /** Per month, billed monthly. */
  monthly: number;
  blurb: string;
  highlight?: boolean;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    key: "starter",
    name: "Starter",
    monthly: 19,
    blurb: "Everything you need to open your store and start selling.",
    features: [
      "Online store with themes and the editor",
      "Unlimited products and variants",
      "All payment methods, including cash on delivery",
      "Discount codes",
      "2 staff accounts",
    ],
  },
  {
    key: "growth",
    name: "Growth",
    monthly: 49,
    blurb: "For growing brands selling in more places.",
    highlight: true,
    features: [
      "Everything in Starter",
      "Sell in 3 markets with their own currency and prices",
      "Scheduled sales and automatic discounts",
      "Custom sections and custom code",
      "5 staff accounts",
    ],
  },
  {
    key: "scale",
    name: "Scale",
    monthly: 149,
    blurb: "For high-volume businesses and larger teams.",
    features: [
      "Everything in Growth",
      "Unlimited markets",
      "Room for larger teams",
      "Priority support",
      "15 staff accounts",
    ],
  },
];

/** The comparison table under the plans. `true` = included, string = limit. */
export const COMPARISON: { group: string; rows: [string, ...(boolean | string)[]][] }[] = [
  {
    group: "Store",
    rows: [
      ["Online store and themes", true, true, true],
      ["Theme editor with sections and blocks", true, true, true],
      ["Custom sections and custom code", false, true, true],
      ["Blog and content pages", true, true, true],
      ["Your own domain", true, true, true],
    ],
  },
  {
    group: "Selling",
    rows: [
      ["Products and variants", "Unlimited", "Unlimited", "Unlimited"],
      ["Inventory tracking and stock history", true, true, true],
      ["Customer accounts", true, true, true],
      ["Markets (currencies and prices)", "1", "3", "Unlimited"],
      ["Shipping and tax rules by region", true, true, true],
    ],
  },
  {
    group: "Payments",
    rows: [
      ["Cards through Stripe", true, true, true],
      ["Local wallets and gateways", true, true, true],
      ["Cash on delivery and bank transfer", true, true, true],
    ],
  },
  {
    group: "Marketing",
    rows: [
      ["Discount codes", true, true, true],
      ["Automatic discounts", false, true, true],
      ["Scheduled sales", false, true, true],
    ],
  },
  {
    group: "Team",
    rows: [
      ["Staff accounts", "2", "5", "15"],
      ["Roles and permissions", true, true, true],
      ["Two-step sign-in", true, true, true],
      ["Support", "Email", "Email", "Priority"],
    ],
  },
];

export const PRICING_FAQ: { q: string; a: string }[] = [
  {
    q: "Is CartForge really free right now?",
    a: "Yes. While CartForge is in beta, every plan is free. We'll tell you well before billing starts, and you can choose a plan then.",
  },
  {
    q: "Do I need a credit card to start?",
    a: "No. Create your store with just your email and a password.",
  },
  {
    q: "Which payment methods can my customers use?",
    a: "Cards through Stripe, local wallets and gateways, bank transfer and cash on delivery. You choose which ones to offer.",
  },
  {
    q: "Can I sell in more than one currency?",
    a: "Yes. Markets let you sell in other countries with their own currency, prices, shipping and taxes.",
  },
  {
    q: "Can I use my own domain?",
    a: "Yes. Connect a domain you own, or start with a free store address and add your domain later.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes, at any time. Your store, products and orders stay exactly as they are.",
  },
];
