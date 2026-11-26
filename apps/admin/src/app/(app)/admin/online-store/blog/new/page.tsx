"use client";

import { PageHeader } from "@cartforge/ui";
import { ArticleEditor } from "@/components/online-store/article-editor";
import { useBreadcrumbTitle } from "@/lib/breadcrumbs";

export default function NewArticlePage() {
  useBreadcrumbTitle("Add blog post");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Add blog post" />
      <ArticleEditor article={null} />
    </div>
  );
}
