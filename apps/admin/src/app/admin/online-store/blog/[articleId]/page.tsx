"use client";

import { useParams } from "next/navigation";
import { Alert, PageHeader, Skeleton } from "@cartforge/ui";
import { ArticleEditor } from "@/components/online-store/article-editor";
import { useBreadcrumbTitle } from "@/lib/breadcrumbs";
import { useArticle } from "@/lib/online-store";

export default function EditArticlePage() {
  const { articleId } = useParams<{ articleId: string }>();
  const article = useArticle(articleId);
  useBreadcrumbTitle(article.data?.title ?? "Blog post");
  if (article.isError)
    return (
      <Alert tone="danger" title="Couldn't load the blog post">
        {article.error.message}
      </Alert>
    );
  if (!article.data) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={article.data.title} />
      <ArticleEditor key={article.data.updated_at} article={article.data} />
    </div>
  );
}
