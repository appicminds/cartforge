"use client";

import { useParams } from "next/navigation";
import { Alert, PageHeader, Skeleton } from "@cartforge/ui";
import { PageEditor } from "@/components/online-store/page-editor";
import { useBreadcrumbTitle } from "@/lib/breadcrumbs";
import { usePage } from "@/lib/online-store";

export default function EditPagePage() {
  const { pageId } = useParams<{ pageId: string }>();
  const page = usePage(pageId);
  useBreadcrumbTitle(page.data?.title ?? "Page");
  if (page.isError)
    return (
      <Alert tone="danger" title="Couldn't load the page">
        {page.error.message}
      </Alert>
    );
  if (!page.data) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={page.data.title} />
      <PageEditor key={page.data.updated_at} page={page.data} />
    </div>
  );
}
