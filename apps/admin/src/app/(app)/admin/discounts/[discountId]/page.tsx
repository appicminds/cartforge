"use client";

import { useParams } from "next/navigation";
import { Alert, PageHeader, Skeleton } from "@cartforge/ui";
import { DiscountEditor } from "@/components/discounts/discount-editor";
import { useBreadcrumbTitle } from "@/lib/breadcrumbs";
import { useDiscount } from "@/lib/discounts";

export default function DiscountPage() {
  const { discountId } = useParams<{ discountId: string }>();
  const q = useDiscount(discountId);
  useBreadcrumbTitle(q.data?.code ?? q.data?.title);
  if (q.isError)
    return (
      <Alert tone="danger" title="Couldn't load this discount">
        {q.error.message}
      </Alert>
    );
  if (!q.data) return <Skeleton className="h-96 w-full" />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={q.data.code ?? q.data.title} description={q.data.summary} />
      <DiscountEditor key={q.data.id + q.data.created_at} discount={q.data} />
    </div>
  );
}
