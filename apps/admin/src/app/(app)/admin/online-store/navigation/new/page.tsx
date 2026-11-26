"use client";

import { PageHeader } from "@cartforge/ui";
import { MenuEditor } from "@/components/online-store/menu-editor";
import { useBreadcrumbTitle } from "@/lib/breadcrumbs";

export default function NewMenuPage() {
  useBreadcrumbTitle("Add menu");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Add menu" />
      <MenuEditor menu={null} />
    </div>
  );
}
