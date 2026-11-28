/**
 * Site-wide settings for the public website. It's served by the admin app, so
 * sign-up and log-in are on the same address (relative links).
 */
export const APP_URL = "";
/** The public address, for the sitemap, canonical links and sharing images. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://cartforge-app.vercel.app"
).replace(/\/+$/, "");

export const SIGNUP_URL = `${APP_URL}/signup`;
export const LOGIN_URL = `${APP_URL}/login`;

/** Sign-up link carrying the email typed on the site, so the form starts filled in. */
export const signupWith = (email?: string) =>
  email ? `${SIGNUP_URL}?email=${encodeURIComponent(email)}` : SIGNUP_URL;

export interface FeatureLink {
  href: string;
  title: string;
  text: string;
  icon: "store" | "box" | "card" | "globe" | "megaphone" | "settings" | "server";
}

/** The Features menu. It points at the home page's sections and the self-hosted page. */
export const FEATURES: FeatureLink[] = [
  {
    href: "/#store-builder",
    title: "Store builder",
    text: "Themes and a drag-and-drop editor",
    icon: "store",
  },
  {
    href: "/#sell",
    title: "Sell online",
    text: "Products, variants, inventory and checkout",
    icon: "box",
  },
  {
    href: "/#payments",
    title: "Payments",
    text: "Cards, wallets, bank transfer and cash on delivery",
    icon: "card",
  },
  {
    href: "/#markets",
    title: "Sell internationally",
    text: "Currencies, prices, shipping and tax by region",
    icon: "globe",
  },
  {
    href: "/#grow",
    title: "Marketing",
    text: "Discounts, scheduled sales and a blog",
    icon: "megaphone",
  },
  {
    href: "/#manage",
    title: "Run your business",
    text: "Orders, customers, staff and security",
    icon: "settings",
  },
  {
    href: "/self-hosted",
    title: "Self-hosted",
    text: "Your own installation on your own server",
    icon: "server",
  },
];

/**
 * Where "Get a license" goes for the self-hosted edition (a checkout or payment
 * link from your licensing provider, or a contact page). Until it's set, the
 * button leads to the self-hosted pricing details.
 */
export const LICENSE_URL = process.env.NEXT_PUBLIC_LICENSE_URL || "/pricing#self-hosted";

/** The two ways to run CartForge. */
export const EDITIONS = {
  cloud: {
    name: "CartForge Cloud",
    model: "Subscription",
    tagline: "We run the platform. You run the business.",
    points: [
      "Subscribe and start selling in minutes",
      "Hosting, security, backups and updates handled for you",
      "No servers to set up or look after",
      "Scale from your first order to your busiest season",
    ],
  },
  selfHosted: {
    name: "CartForge Self-hosted",
    model: "One-time license",
    tagline: "Pay once. Own the complete platform.",
    points: [
      "Your own server: run it anywhere, completely separate from us",
      "Your own database: every product, order and customer stays with you",
      "Your own code: the full source code, yours to change however you like",
      "One payment for the complete solution, no monthly platform fee",
    ],
  },
} as const;
