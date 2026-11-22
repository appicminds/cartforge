"use client";

import { useParams } from "next/navigation";
import { Alert, PageHeader, Skeleton } from "@cartforge/ui";
import { MenuEditor } from "@/components/online-store/menu-editor";
import { useBreadcrumbTitle } from "@/lib/breadcrumbs";
import { useMenu } from "@/lib/online-store";

export default function EditMenuPage() {
  const { menuId } = useParams<{ menuId: string }>();
  const menu = useMenu(menuId);
  useBreadcrumbTitle(menu.data?.title ?? "Menu");
  if (menu.isError)
    return (
      <Alert tone="danger" title="Couldn't load the menu">
        {menu.error.message}
      </Alert>
    );
  if (!menu.data) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={menu.data.title} />
      <MenuEditor key={menu.data.updated_at} menu={menu.data} />
    </div>
  );
}
