import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OrderView } from "@/components/order-view";
import { storefront } from "@/lib/api";
import { account, customerToken } from "@/lib/commerce";

export const metadata: Metadata = { title: "Order" };

/** A signed-in customer's own order (no private link needed). */
export default async function AccountOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await customerToken();
  if (!token) redirect(`/account/login?next=/account/orders/${id}`);
  const [r, store] = await Promise.all([account.order(token, id), storefront.store()]);
  if (!r.ok) notFound();
  return (
    <div className="-mx-4 -my-10 md:-my-16">
      <div className="px-4 pt-6">
        <Link href="/account" className="text-sm underline underline-offset-2">
          ← Your account
        </Link>
      </div>
      <OrderView o={r.data} store={store} payKey={null} />
    </div>
  );
}
