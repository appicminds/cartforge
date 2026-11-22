"use client";

import Link from "next/link";
import { Alert } from "@cartforge/ui";
import { formatDateTime } from "@/lib/format";
import { useProductSale } from "@/lib/sales";

/** "In Eid Sale (20% off) until …" on the product page while a sale covers it. */
export function ProductSaleBanner({ productId }: { productId: string }) {
  const sale = useProductSale(productId);
  const s = sale.data;
  if (!s) return null;
  const when =
    s.status === "running"
      ? s.ends_at
        ? `until ${formatDateTime(s.ends_at)}`
        : "until you end it"
      : "starting soon";
  return (
    <Alert
      tone={s.status === "running" ? "warning" : "info"}
      title={`${s.status === "running" ? "In" : "Scheduled for"} sale: ${s.title} (${s.summary}) ${when}`}
    >
      {s.status === "running"
        ? "The price below is the sale price. If you change it now, your new price stays when the sale ends. "
        : "Prices change when the sale starts. "}
      <Link
        href={`/admin/discounts/sales/${s.id}`}
        className="font-medium underline underline-offset-2"
      >
        View sale
      </Link>
    </Alert>
  );
}
