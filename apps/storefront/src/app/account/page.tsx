import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteAddress, logout } from "@/app/actions/account";
import { ProfileForm } from "@/components/account/forms";
import { storefront } from "@/lib/api";
import { account, currentCustomer, customerToken } from "@/lib/commerce";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Your account" };

const STATUS: Record<string, string> = {
  pending: "Confirmed",
  processing: "Processing",
  completed: "Completed",
  canceled: "Canceled",
  refunded: "Refunded",
  on_hold: "On hold",
};

export default async function AccountPage() {
  const customer = await currentCustomer();
  if (!customer) redirect("/account/login?next=/account");
  const [orders, store] = await Promise.all([
    account.orders((await customerToken())!),
    storefront.store(),
  ]);
  const date = new Intl.DateTimeFormat(store.locale, { dateStyle: "medium" });
  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl">
            Hello{customer.first_name ? `, ${customer.first_name}` : ""}
          </h1>
          <p className="mt-1 text-muted">{customer.email}</p>
        </div>
        <form action={logout}>
          <button type="submit" className="text-sm underline underline-offset-2">
            Sign out
          </button>
        </form>
      </div>

      <section aria-labelledby="orders-h">
        <h2 id="orders-h" className="font-body text-lg font-semibold">
          Your orders
        </h2>
        {orders.ok && orders.data.length > 0 ? (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {orders.data.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-4 text-sm">
                <Link
                  href={`/account/orders/${o.id}`}
                  className="font-medium underline underline-offset-2"
                >
                  Order #{o.number}
                </Link>
                <span className="text-muted">{date.format(new Date(o.placed_at))}</span>
                <span>{STATUS[o.status] ?? o.status}</span>
                <span className="ml-auto">
                  {formatMoney(o.total_minor, o.currency, store.locale)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-muted">
            No orders yet.{" "}
            <Link href="/products" className="underline underline-offset-2">
              Start shopping
            </Link>
          </p>
        )}
      </section>

      <section aria-labelledby="addr-h">
        <div className="flex items-center justify-between gap-4">
          <h2 id="addr-h" className="font-body text-lg font-semibold">
            Addresses
          </h2>
          <Link href="/account/addresses/new" className="text-sm underline underline-offset-2">
            Add an address
          </Link>
        </div>
        {customer.addresses.length === 0 ? (
          <p className="mt-3 text-muted">Save an address to check out faster.</p>
        ) : (
          <ul className="mt-3 grid gap-4 sm:grid-cols-2">
            {customer.addresses.map((a) => (
              <li key={a.id} className="rounded-[var(--sf-radius)] border border-line p-4 text-sm">
                {a.is_default && <p className="mb-1 font-medium">Default</p>}
                <p>{[a.address.first_name, a.address.last_name].filter(Boolean).join(" ")}</p>
                <p>{a.address.address1}</p>
                <p>
                  {[a.address.city, a.address.region, a.address.postal_code]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <div className="mt-3 flex gap-4">
                  <Link
                    href={`/account/addresses/${a.id}`}
                    className="underline underline-offset-2"
                  >
                    Edit<span className="sr-only"> {a.address.address1}</span>
                  </Link>
                  <form action={deleteAddress}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className="underline underline-offset-2">
                      Delete<span className="sr-only"> {a.address.address1}</span>
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="details-h">
        <h2 id="details-h" className="mb-4 font-body text-lg font-semibold">
          Your details
        </h2>
        <ProfileForm customer={customer} />
      </section>
    </div>
  );
}
