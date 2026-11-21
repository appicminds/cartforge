import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AutoPost } from "@/components/checkout/auto-post";
import { commerce } from "@/lib/commerce";

export const metadata: Metadata = {
  title: "Payment",
  robots: { index: false, follow: false },
  // The address carries the order's private key: never send it to the payment page.
  referrer: "no-referrer",
};

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Hands the shopper over to the payment provider (Next 5). */
export default async function PayPage({ params, searchParams }: Props) {
  const { id } = await params;
  const raw = (await searchParams).key;
  const key = Array.isArray(raw) ? raw[0] : raw;
  if (!key) notFound();
  const r = await commerce.startPayment(id, key);
  if (r.ok && r.data.method === "GET") redirect(r.data.url);

  const orderUrl = `/orders/${id}?key=${encodeURIComponent(key)}`;
  return (
    <div className="sf-container max-w-xl py-16">
      {r.ok ? (
        <>
          <h1 className="text-3xl">Taking you to payment…</h1>
          <p className="mt-2 text-muted">
            You&apos;ll pay on the provider&apos;s secure page, then come back here.
          </p>
          <AutoPost url={r.data.url} fields={r.data.fields} label="Continue to payment" />
        </>
      ) : r.status === 404 ? (
        notFound()
      ) : (
        <>
          <h1 className="text-3xl">We couldn&apos;t start the payment</h1>
          <p className="mt-2 text-muted" role="alert">
            {r.message}
          </p>
          <p className="mt-2 text-muted">
            Your order is saved. You can try again from your order page.
          </p>
          <Link href={orderUrl} className="sf-button mt-6">
            Go to my order
          </Link>
        </>
      )}
    </div>
  );
}
