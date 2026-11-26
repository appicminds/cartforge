import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Banknote, Building2, CreditCard, Smartphone, Truck } from "lucide-react";
import { Eyebrow, Points } from "@/components/section";
import { Shot } from "@/components/shot";
import { SignupForm } from "@/components/signup-form";
import { BETA } from "@/lib/plans";

const THEMES = [
  { key: "foundry", name: "Foundry", text: "Classic and calm, with serif headings." },
  { key: "noor", name: "Noor", text: "Modest fashion in stone, black and gold." },
  { key: "bazaar", name: "Bazaar", text: "Bold fashion with a big slideshow." },
  { key: "minimal", name: "Minimal", text: "One typeface and lots of white space." },
];

const PAYMENT_METHODS = [
  { icon: CreditCard, title: "Cards", text: "Visa, Mastercard and more through Stripe." },
  { icon: Building2, title: "Local gateways", text: "Regional payment gateways like Safepay." },
  { icon: Smartphone, title: "Mobile wallets", text: "Wallets such as JazzCash and Easypaisa." },
  { icon: Banknote, title: "Bank transfer", text: "Show your bank details; mark orders paid." },
  { icon: Truck, title: "Cash on delivery", text: "Customers pay when the parcel arrives." },
];

export default function Home() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-ink text-fg-inverse">
        <div aria-hidden className="glow pointer-events-none absolute inset-0" />
        <div className="container-x relative flex flex-col items-center pb-10 pt-16 text-center sm:pt-24">
          {BETA && (
            <p className="mb-6 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm text-fg-inverse-muted">
              CartForge is in beta. Every plan is free while it lasts.
            </p>
          )}
          <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] sm:text-6xl lg:text-7xl">
            Build the store your brand deserves
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-fg-inverse-muted sm:text-xl">
            Design an online store you&apos;re proud of, get paid every way your customers like to
            pay, and run your whole business from one place.
          </p>
          <div className="mt-10 flex w-full justify-center">
            <SignupForm id="hero-email" />
          </div>
        </div>
        <div className="container-x relative pb-0">
          <div className="relative mx-auto max-w-5xl translate-y-10">
            <Shot
              src="/shots/storefront.webp"
              alt="A CartForge store's home page: a slideshow of abayas and a row of best sellers"
              address="noor-studio.store"
              tone="dark"
              priority
            />
            <div className="absolute -bottom-8 -right-4 hidden w-[46%] md:block lg:-right-16">
              <Shot
                src="/shots/orders.webp"
                alt="The orders list in CartForge's admin"
                tone="light"
                sizes="520px"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Sell ── */}
      <section id="sell" className="bg-paper pb-24 pt-36">
        <div className="container-x grid items-center gap-14 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <Eyebrow>Sell online</Eyebrow>
            <h2 className="text-4xl font-semibold sm:text-5xl">
              Everything you need to start selling
            </h2>
            <p className="max-w-xl text-lg text-fg-muted">
              Add your products, set your prices and open your doors. Checkout, stock and orders are
              taken care of.
            </p>
            <Points
              items={[
                {
                  title: "Products and variants",
                  text: "Sizes, colors and more, each with its own price and stock.",
                },
                {
                  title: "One-page checkout",
                  text: "Fast on phones, with saved details for returning customers.",
                },
                {
                  title: "Inventory you can trust",
                  text: "Stock is held while customers check out, so you never oversell.",
                },
                {
                  title: "Orders in one list",
                  text: "Mark paid, ship, refund and keep a full timeline.",
                },
              ]}
            />
          </div>
          <Shot
            src="/shots/products.webp"
            alt="The products list with pictures, variants and prices"
          />
        </div>
      </section>

      {/* ── Store builder ── */}
      <section id="store-builder" className="bg-paper-2 py-24">
        <div className="container-x flex flex-col gap-12">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
            <Eyebrow>Store builder</Eyebrow>
            <h2 className="text-4xl font-semibold sm:text-5xl">
              Design it your way. No code needed.
            </h2>
            <p className="text-lg text-fg-muted">
              Pick a theme, then make it yours: drag sections into place, change colors and fonts,
              and see every change in a live preview before you publish.
            </p>
          </div>
          <Shot
            src="/shots/editor.webp"
            alt="The theme editor: a list of sections on the left and a live preview of the store"
            address="Theme editor"
          />
          <Points
            items={[
              {
                title: "Sections and blocks",
                text: "Slideshows, collections, image grids, FAQs, videos and more.",
              },
              {
                title: "Your brand's colors",
                text: "Choose one brand color and the whole theme follows, readably.",
              },
              {
                title: "Pages and a blog",
                text: "About pages, size guides and stories, all on your store.",
              },
              {
                title: "Custom code when you want it",
                text: "Add your own HTML and CSS sections for anything special.",
              },
            ]}
          />
          <div id="themes" className="flex flex-col gap-6 pt-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h3 className="text-2xl font-semibold sm:text-3xl">Start from a theme</h3>
                <p className="mt-2 text-fg-muted">Every theme is free and fully customizable.</p>
              </div>
            </div>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {THEMES.map((t) => (
                <li key={t.key} className="flex flex-col gap-3">
                  <Image
                    src={`/themes/${t.key}.webp`}
                    alt={`The ${t.name} theme's home page`}
                    width={800}
                    height={650}
                    sizes="(min-width: 1024px) 280px, (min-width: 640px) 50vw, 100vw"
                    className="aspect-[16/12] w-full rounded-xl border border-line object-cover object-top shadow-sm"
                  />
                  <div>
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-sm text-fg-muted">{t.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Payments ── */}
      <section id="payments" className="relative overflow-hidden bg-ink py-24 text-fg-inverse">
        <div aria-hidden className="glow pointer-events-none absolute inset-0 opacity-60" />
        <div className="container-x relative grid items-center gap-14 lg:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col gap-6">
            <Eyebrow tone="dark">Payments</Eyebrow>
            <h2 className="text-4xl font-semibold sm:text-5xl">
              Get paid the way your customers pay
            </h2>
            <p className="max-w-xl text-lg text-fg-inverse-muted">
              Offer the methods people trust where you sell, from cards to cash. Online payments are
              matched to their orders automatically.
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {PAYMENT_METHODS.map(({ icon: Icon, title, text }) => (
                <li
                  key={title}
                  className="flex gap-3 rounded-xl border border-line-dark bg-ink-2 p-4"
                >
                  <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-ember-bright" />
                  <span>
                    <span className="block font-semibold">{title}</span>
                    <span className="block text-sm text-fg-inverse-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <Shot
            src="/shots/checkout.webp"
            alt="The store's checkout with an order summary and a discount code box"
            address="Checkout"
            tone="dark"
          />
        </div>
      </section>

      {/* ── Markets ── */}
      <section id="markets" className="bg-paper py-24">
        <div className="container-x grid items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
          <Shot
            src="/shots/markets.webp"
            alt="Markets: Pakistan, the Gulf, the United Kingdom and the United States, each with its own currency"
          />
          <div className="flex flex-col gap-6 lg:order-last">
            <Eyebrow>Sell internationally</Eyebrow>
            <h2 className="text-4xl font-semibold sm:text-5xl">One store. Every market.</h2>
            <p className="max-w-xl text-lg text-fg-muted">
              Sell to new countries without opening new stores. Each market gets its own currency,
              prices and ways to pay.
            </p>
            <Points
              items={[
                { title: "Local currencies", text: "Shoppers see prices in their own money." },
                { title: "Prices per market", text: "Use an exchange rate or set exact prices." },
                {
                  title: "Shipping by region",
                  text: "Rates, free-shipping thresholds and limits.",
                },
                {
                  title: "Taxes by region",
                  text: "Included or added, set for each place you sell.",
                },
              ]}
            />
          </div>
        </div>
      </section>

      {/* ── Marketing ── */}
      <section id="grow" className="bg-paper-2 py-24">
        <div className="container-x grid items-center gap-14 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <Eyebrow>Marketing</Eyebrow>
            <h2 className="text-4xl font-semibold sm:text-5xl">Turn visitors into regulars</h2>
            <p className="max-w-xl text-lg text-fg-muted">
              Run the promotions that work for your brand, and bring people back with stories worth
              reading.
            </p>
            <Points
              items={[
                {
                  title: "Discount codes",
                  text: "Percent or fixed amounts, with minimums and limits.",
                },
                { title: "Automatic discounts", text: "Applied at checkout without a code." },
                {
                  title: "Scheduled sales",
                  text: "Mark down a collection, end it on a date, prices return.",
                },
                {
                  title: "A blog on your store",
                  text: "Write posts, schedule them, and show them anywhere.",
                },
              ]}
            />
          </div>
          <div className="flex flex-col gap-5">
            <Shot
              src="/shots/discounts.webp"
              alt="Discounts: an automatic discount and two discount codes"
              height={560}
              sizes="(min-width: 1024px) 560px, 100vw"
            />
            <div className="lg:ml-16">
              <Shot
                src="/shots/sales.webp"
                alt="A running sale: 15% off the velvet and lace collection until a set date"
                height={520}
                sizes="(min-width: 1024px) 500px, 100vw"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Manage ── */}
      <section id="manage" className="bg-paper py-24">
        <div className="container-x flex flex-col gap-12">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
            <Eyebrow>Run your business</Eyebrow>
            <h2 className="text-4xl font-semibold sm:text-5xl">
              Your whole business, in one place
            </h2>
            <p className="text-lg text-fg-muted">
              From the first order to your hundredth customer, everything is organized and easy to
              find, for you and your team.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <Shot
                src="/shots/order.webp"
                alt="An order with its items, payment, shipping address and timeline"
                sizes="(min-width: 1024px) 560px, 100vw"
              />
              <div>
                <h3 className="text-xl font-semibold">Orders</h3>
                <p className="text-fg-muted">
                  Payment, shipping and refunds, with a timeline of everything that happened.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <Shot
                src="/shots/customers.webp"
                alt="Customers with their orders and amount spent"
                sizes="(min-width: 1024px) 560px, 100vw"
              />
              <div>
                <h3 className="text-xl font-semibold">Customers</h3>
                <p className="text-fg-muted">
                  Accounts, addresses and order history for everyone who buys from you.
                </p>
              </div>
            </div>
          </div>
          <Points
            items={[
              {
                title: "Staff accounts and roles",
                text: "Invite your team and choose what each person can do.",
              },
              {
                title: "Two-step sign-in",
                text: "Protect every account with an authenticator app.",
              },
              {
                title: "Order emails",
                text: "Customers get a receipt and updates as their order moves.",
              },
              { title: "Your own domain", text: "Connect the address you already own." },
            ]}
          />
        </div>
      </section>

      {/* ── Pricing teaser ── */}
      <section className="bg-paper-2 py-20">
        <div className="container-x flex flex-col items-center gap-5 text-center">
          <h2 className="text-3xl font-semibold sm:text-4xl">Simple plans that grow with you</h2>
          <p className="max-w-xl text-lg text-fg-muted">
            {BETA
              ? "Every plan is free while CartForge is in beta. No credit card needed."
              : "Start small and upgrade as you grow."}
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-full border border-ink px-6 py-3 font-semibold hover:bg-ink hover:text-white"
          >
            See pricing <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </section>

      {/* ── Final call to action ── */}
      <section className="relative overflow-hidden bg-ink py-24 text-fg-inverse">
        <div aria-hidden className="glow pointer-events-none absolute inset-0" />
        <div className="container-x relative flex flex-col items-center gap-6 text-center">
          <h2 className="max-w-3xl text-4xl font-semibold sm:text-6xl">
            Your store could be live today
          </h2>
          <p className="max-w-xl text-lg text-fg-inverse-muted">
            Create your store in minutes. Add products, choose a theme, and share your link.
          </p>
          <div className="flex w-full justify-center">
            <SignupForm id="cta-email" />
          </div>
        </div>
      </section>
    </>
  );
}
