import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AddressForm } from "@/components/account/forms";
import { storefront } from "@/lib/api";
import { currentCustomer } from "@/lib/commerce";

export const metadata: Metadata = { title: "Add an address" };

export default async function NewAddressPage() {
  const [customer, store] = await Promise.all([currentCustomer(), storefront.store()]);
  if (!customer) redirect("/account/login?next=/account/addresses/new");
  return (
    <div>
      <h1 className="mb-6 text-3xl">Add an address</h1>
      <AddressForm
        value={null}
        isDefault={customer.addresses.length === 0}
        countries={null}
        locale={store.locale}
      />
    </div>
  );
}
