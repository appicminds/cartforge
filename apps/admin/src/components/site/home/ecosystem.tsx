import {
  BadgePercent,
  Boxes,
  Code2,
  CreditCard,
  FileText,
  Globe2,
  LayoutTemplate,
  Link2,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

const PARTS: [LucideIcon, string, string][] = [
  [LayoutTemplate, "Storefront and themes", "A fast store you design in a visual editor"],
  [ShoppingCart, "Checkout", "One page, built for phones, stock held while paying"],
  [CreditCard, "Payments", "Cards, wallets, bank transfer and cash on delivery"],
  [Truck, "Orders and shipping", "Pay, ship, refund, with rates and rules by region"],
  [Boxes, "Products and inventory", "Variants, stock levels and a full stock history"],
  [Users, "Customers", "Accounts, addresses and order history"],
  [Globe2, "Markets", "Currencies, prices and taxes for each country"],
  [BadgePercent, "Discounts and sales", "Codes, automatic offers and scheduled sales"],
  [FileText, "Pages and blog", "Content that helps people find and trust you"],
  [ShieldCheck, "Team and security", "Staff roles and two-step sign-in"],
  [Link2, "Domains", "Your own address, with a free one to start"],
  [Code2, "REST API", "Your store's data, available to your own code"],
];

/** "Not just a website builder": every part of the platform at a glance. */
export function Ecosystem() {
  return (
    <ul className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
      {PARTS.map(([Icon, title, text]) => (
        <li key={title} className="reveal flex flex-col gap-3 bg-paper p-6 sm:p-7">
          <span className="flex size-11 items-center justify-center rounded-xl bg-ember-soft text-ember">
            <Icon aria-hidden className="size-5" />
          </span>
          <span className="font-display text-lg font-semibold">{title}</span>
          <span className="text-[15px] text-fg-muted">{text}</span>
        </li>
      ))}
    </ul>
  );
}
