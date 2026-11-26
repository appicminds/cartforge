/**
 * Site-wide settings for the marketing site. The app (sign-up, log-in, admin)
 * lives on its own address; set NEXT_PUBLIC_APP_URL in each environment.
 */
export const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? "https://cartforge-app.vercel.app"
).replace(/\/+$/, "");
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://cartforge-web.vercel.app"
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
  icon: "store" | "box" | "card" | "globe" | "megaphone" | "settings";
}

/** The Features menu. Phase 1 points at the home page's sections. */
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
];
