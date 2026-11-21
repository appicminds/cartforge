import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AddressForm } from "@/components/account/forms";
import { storefront } from "@/lib/api";
import { currentCustomer } from "@/lib/commerce";

export const metadata: Metadata = { title: "Edit address" };

export default async function EditAddressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [customer, store] = await Promise.all([currentCustomer(), storefront.store()]);
  if (!customer) redirect("/account/login?next=/account");
  const a = customer.addresses.find((x) => x.id === id);
  if (!a) notFound();
  return (
    <div>
      <h1 className="mb-6 text-3xl">Edit address</h1>
      <AddressForm
        id={a.id}
        value={a.address}
        isDefault={a.is_default}
        countries={null}
        locale={store.locale}
      />
    </div>
  );
}
