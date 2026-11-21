import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { storefront } from "@/lib/api";
import { commerce } from "@/lib/commerce";
import { OrderView } from "@/components/order-view";

export const metadata: Metadata = {
  title: "Order confirmed",
  robots: { index: false, follow: false, nocache: true },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Order status page, reachable only with the secret key from checkout (PRD §13.2, §16). */
export default async function OrderPage({ params, searchParams }: Props) {
  const { id } = await params;
  const raw = (await searchParams).key;
  const key = Array.isArray(raw) ? raw[0] : raw;
  if (!key) notFound();
  const [r, store] = await Promise.all([commerce.order(id, key), storefront.store()]);
  if (!r.ok) notFound();
  return <OrderView o={r.data} store={store} payKey={key} />;
}
