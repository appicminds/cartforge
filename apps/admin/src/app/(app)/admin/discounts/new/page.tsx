"use client";

import { PageHeader } from "@cartforge/ui";
import { DiscountEditor } from "@/components/discounts/discount-editor";

export default function NewDiscountPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Create discount" />
      <DiscountEditor discount={null} />
    </div>
  );
}
