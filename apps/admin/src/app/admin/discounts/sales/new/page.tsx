"use client";

import { PageHeader } from "@cartforge/ui";
import { SaleEditor } from "@/components/discounts/sale-editor";
import { useBreadcrumbTitle } from "@/lib/breadcrumbs";

export default function NewSalePage() {
  useBreadcrumbTitle("Run a sale");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Run a sale"
        description="Lower many prices at once, e.g. 20% off everything for Eid. Prices go back when the sale ends."
      />
      <SaleEditor sale={null} />
    </div>
  );
}
