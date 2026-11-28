import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Developers } from "@/components/site/home/developers";
import { Ecosystem } from "@/components/site/home/ecosystem";
import { Editions } from "@/components/site/home/editions";
import { PhotoFill } from "@/components/site/home/photo";
import { Showcase } from "@/components/site/home/showcase";
import { ThemeCarousel } from "@/components/site/home/theme-carousel";
import {
  CurrencyCard,
  DiscountCard,
  OrderCard,
  PaymentsCard,
  SalesCard,
  SecurityCard,
  ShippedCard,
} from "@/components/site/home/ui-cards";
import { SignupForm } from "@/components/site/signup-form";
import { BETA } from "@/lib/site/plans";
import { PHOTOS } from "@/lib/site/photos";

function Eyebrow({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <p
      className={`text-sm font-semibold uppercase tracking-[0.16em] ${dark ? "text-ember-bright" : "text-ember"}`}
    >
      {children}
    </p>
  );
}

export default function Home() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-ink text-fg-inverse">
        <div aria-hidden className="glow pointer-events-none absolute inset-0" />
        <div className="container-x relative pb-16 pt-20 sm:pt-28">
          <p className="inline-flex rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm text-fg-inverse-muted">
            Cloud or self-hosted{BETA ? " · free during beta" : ""}
          </p>
          <h1 className="display-xl mt-8">
            <span className="block">Your store.</span>
            <span className="block text-ember-bright">Your rules.</span>
          </h1>
          <div className="mt-10 flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex max-w-xl flex-col gap-5">
              <p className="lede text-fg-inverse-muted">
                CartForge is a complete commerce platform: storefront, checkout, payments, orders
                and more. Let us run it for you, or run it on your own server. Either way, it&apos;s
                yours.
              </p>
              <Link
                href="/self-hosted"
                className="inline-flex w-fit items-center gap-2 font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-white"
              >
                Want it on your own server? See self-hosted{" "}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
            <SignupForm
              id="hero-email"
              note="Start on CartForge Cloud. Free during beta, no credit card."
            />
          </div>
        </div>

        {/* The stage: the store on desktop and phone, with live-looking moments around it. */}
        <div className="container-x relative pb-24">
          <div className="relative mx-auto max-w-6xl">
            <div className="frame border-white/10">
              <Image
                src="/site/shots/storefront.webp"
                alt="A store built with CartForge: a slideshow of abayas and a row of best sellers"
                width={2000}
                height={1250}
                priority
                sizes="(min-width: 1280px) 1150px, 100vw"
                className="block h-auto w-full"
              />
            </div>
            <div className="absolute -bottom-16 left-[4%] hidden w-[19%] md:block">
              <div className="overflow-hidden rounded-[2rem] border-[6px] border-ink-3 shadow-[0_40px_80px_-20px_rgb(0_0_0/0.7)]">
                <Image
                  src="/site/shots/phone-product.webp"
                  alt="The same store on a phone: a product page with sizes and lengths"
                  width={780}
                  height={1688}
                  sizes="220px"
                  className="block h-auto w-full"
                />
              </div>
            </div>
            <OrderCard className="float-slow absolute -top-6 right-[6%] hidden md:flex" />
            <SalesCard className="float-slower absolute -bottom-14 right-[-2%] hidden lg:block" />
          </div>
        </div>
      </section>

      {/* ── Statement ── */}
      <section className="bg-paper pb-24 pt-36 sm:pt-44">
        <div className="container-x">
          <Eyebrow>A complete commerce platform</Eyebrow>
          <h2 className="display-lg reveal mt-6 max-w-5xl">
            Not just a website builder.{" "}
            <span className="text-fg-muted">Everything it takes to run a business that sells.</span>
          </h2>
          <div className="mt-16">
            <Ecosystem />
          </div>
        </div>
      </section>

      {/* ── Two ways to run it ── */}
      <section id="editions" className="bg-paper-2 py-28">
        <div className="container-x flex flex-col gap-14">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
            <Eyebrow>Freedom to choose</Eyebrow>
            <h2 className="display-lg">Two ways to run CartForge</h2>
            <p className="lede text-fg-muted">
              The same platform, your choice of how it runs. Start in our cloud and move to your own
              server later, or own it from day one.
            </p>
          </div>
          <Editions />
        </div>
      </section>

      {/* ── Product showcase ── */}
      <section id="store-builder" className="relative overflow-hidden bg-ink py-28 text-fg-inverse">
        <div aria-hidden className="glow pointer-events-none absolute inset-0 opacity-70" />
        <div className="container-x relative flex flex-col gap-14">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
            <Eyebrow dark>The CartForge admin</Eyebrow>
            <h2 className="display-lg">Everything in one beautiful place</h2>
            <p className="lede text-fg-inverse-muted">
              Design your store, add products, ship orders and sell abroad, without switching tools.
            </p>
          </div>
          <Showcase />
        </div>
      </section>

      {/* ── Feature bento ── */}
      <section id="sell" className="bg-paper-2 py-28">
        <div className="container-x flex flex-col gap-14">
          <div className="flex max-w-3xl flex-col gap-6">
            <Eyebrow>Built in, not bolted on</Eyebrow>
            <h2 className="display-lg">Everything you need to sell</h2>
          </div>
          <div className="grid gap-5 lg:grid-cols-6">
            <article
              id="payments"
              className="reveal flex flex-col overflow-hidden rounded-3xl bg-ink text-fg-inverse lg:col-span-4"
            >
              <div className="flex flex-col gap-3 p-8 sm:p-10">
                <h3 className="text-3xl font-semibold sm:text-4xl">Get paid every way</h3>
                <p className="max-w-lg text-lg text-fg-inverse-muted">
                  Cards through Stripe, local gateways, mobile wallets, bank transfer and cash on
                  delivery. Online payments match their orders automatically.
                </p>
              </div>
              <div className="relative mt-auto flex justify-center px-8 pb-10">
                <div aria-hidden className="glow absolute inset-0" />
                <PaymentsCard className="relative" />
              </div>
            </article>
            <article className="reveal flex flex-col overflow-hidden rounded-3xl bg-paper lg:col-span-2">
              <div className="flex flex-col gap-3 p-8">
                <h3 className="text-2xl font-semibold">Promotions that work</h3>
                <p className="text-fg-muted">
                  Discount codes, automatic discounts and scheduled sales.
                </p>
              </div>
              <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-paper to-ember-soft px-6 pb-8">
                <DiscountCard />
              </div>
            </article>
            <article
              id="markets"
              className="reveal flex flex-col overflow-hidden rounded-3xl bg-paper lg:col-span-2"
            >
              <div className="flex flex-col gap-3 p-8">
                <h3 className="text-2xl font-semibold">Sell across borders</h3>
                <p className="text-fg-muted">
                  Each market gets its own currency, prices and ways to pay.
                </p>
              </div>
              <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-paper to-paper-2 px-6 pb-8">
                <CurrencyCard />
              </div>
            </article>
            <article className="reveal flex flex-col overflow-hidden rounded-3xl bg-paper lg:col-span-4">
              <div className="flex flex-col gap-3 p-8 sm:p-10">
                <h3 className="text-3xl font-semibold sm:text-4xl">A checkout made for phones</h3>
                <p className="max-w-lg text-lg text-fg-muted">
                  One page, saved details for returning customers, and stock held while they pay, so
                  you never oversell.
                </p>
              </div>
              <div className="mt-auto flex justify-center gap-6 bg-gradient-to-b from-paper to-paper-2 px-8 pt-2">
                <div className="w-44 translate-y-6 overflow-hidden rounded-t-[1.75rem] border-[5px] border-b-0 border-ink shadow-xl sm:w-52">
                  <Image
                    src="/site/shots/phone-home.webp"
                    alt="A store's home page on a phone"
                    width={780}
                    height={1688}
                    sizes="210px"
                    className="block h-auto w-full"
                  />
                </div>
                <div className="hidden w-52 overflow-hidden rounded-t-[1.75rem] border-[5px] border-b-0 border-ink shadow-xl sm:block">
                  <Image
                    src="/site/shots/phone-product.webp"
                    alt="A product page on a phone with sizes and lengths"
                    width={780}
                    height={1688}
                    sizes="210px"
                    className="block h-auto w-full"
                  />
                </div>
              </div>
            </article>
            <article
              id="manage"
              className="reveal flex flex-col overflow-hidden rounded-3xl bg-paper lg:col-span-3"
            >
              <div className="flex flex-col gap-3 p-8">
                <h3 className="text-2xl font-semibold">Orders, handled</h3>
                <p className="text-fg-muted">
                  Mark paid, ship, refund, and keep customers updated by email.
                </p>
              </div>
              <div className="mt-auto flex flex-col items-center gap-3 px-6 pb-8">
                <OrderCard />
                <ShippedCard />
              </div>
            </article>
            <article className="reveal flex flex-col overflow-hidden rounded-3xl bg-paper lg:col-span-3">
              <div className="flex flex-col gap-3 p-8">
                <h3 className="text-2xl font-semibold">Safe for your whole team</h3>
                <p className="text-fg-muted">
                  Staff accounts with roles, and two-step sign-in for everyone.
                </p>
              </div>
              <div className="mt-auto flex justify-center px-6 pb-8">
                <SecurityCard />
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ── Photo band ── */}
      <section className="relative isolate overflow-hidden">
        <div className="relative min-h-[640px]">
          <PhotoFill photo={PHOTOS.founder} sizes="100vw" />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent"
          />
          <div className="container-x relative flex min-h-[640px] flex-col justify-center gap-6 py-24 text-white">
            <Eyebrow dark>For independent brands</Eyebrow>
            <h2 className="display-lg max-w-[14ch]">Built for the way you work</h2>
            <p className="lede max-w-lg text-white/80">
              Whether you sell from a studio, a warehouse or your living room, CartForge keeps the
              busywork out of your way so you can focus on what you make.
            </p>
          </div>
        </div>
      </section>

      {/* ── Merchants and developers ── */}
      <section id="developers" className="bg-paper-2 py-28">
        <div className="container-x flex flex-col gap-14">
          <div className="flex max-w-3xl flex-col gap-6">
            <Eyebrow>One platform, two kinds of freedom</Eyebrow>
            <h2 className="display-lg">Simple for merchants. Open for developers.</h2>
            <p className="lede text-fg-muted">
              Run your whole store without writing a line of code, and give your developers
              everything they need when you want more.
            </p>
          </div>
          <Developers />
        </div>
      </section>

      {/* ── Themes ── */}
      <section id="themes" className="overflow-hidden bg-ink py-28 text-fg-inverse">
        <div className="container-x flex flex-col gap-12">
          <div className="flex flex-col gap-6 lg:max-w-2xl">
            <Eyebrow dark>Themes</Eyebrow>
            <h2 className="display-lg">Start beautiful. Make it yours.</h2>
            <p className="lede text-fg-inverse-muted">
              Every theme is free. Change colors, fonts and sections in the editor, and preview
              every change before shoppers see it.
            </p>
          </div>
          <ThemeCarousel />
        </div>
      </section>

      {/* ── Grow ── */}
      <section id="grow" className="bg-paper py-28">
        <div className="container-x grid items-center gap-16 lg:grid-cols-2">
          <div className="reveal flex flex-col gap-6">
            <Eyebrow>Run your business</Eyebrow>
            <h2 className="display-lg">Know every order inside out</h2>
            <p className="lede text-fg-muted">
              Payments, shipments, refunds and notes in one timeline, plus customer accounts with
              their addresses and history.
            </p>
            <Link
              href="/pricing"
              className="inline-flex w-fit items-center gap-2 text-lg font-semibold text-ember hover:text-ember-hover"
            >
              See plans and pricing <ArrowRight aria-hidden className="size-5" />
            </Link>
          </div>
          <div className="reveal relative">
            <div className="frame">
              <Image
                src="/site/shots/order-detail.webp"
                alt="An order with its items, payment, shipment and customer"
                width={1400}
                height={1364}
                sizes="(min-width: 1024px) 580px, 100vw"
                className="block h-auto w-full"
              />
            </div>
            <ShippedCard className="float-slow absolute -bottom-8 -left-6 hidden sm:flex" />
          </div>
        </div>
      </section>

      {/* ── Final call to action ── */}
      <section className="relative isolate overflow-hidden bg-ink text-fg-inverse">
        <PhotoFill photo={PHOTOS.packing} className="opacity-60" />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/30"
        />
        <div className="container-x relative flex flex-col items-center gap-8 py-32 text-center sm:py-40">
          <h2 className="display-xl max-w-[14ch]">Build something that&apos;s yours</h2>
          <p className="lede max-w-xl text-fg-inverse-muted">
            Start on CartForge Cloud in minutes, or own the whole platform on your own server.
          </p>
          <SignupForm id="cta-email" />
          <Link
            href="/self-hosted"
            className="inline-flex items-center gap-2 font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-white"
          >
            Prefer to self-host? Get a license <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
