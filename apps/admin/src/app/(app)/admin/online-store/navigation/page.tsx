"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { PERMISSIONS, type MenuItem } from "@cartforge/types";
import {
  Alert,
  Button,
  Card,
  PageHeader,
  Skeleton,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@cartforge/ui";
import { OnlineStoreTabs } from "@/components/online-store/tabs";
import { useBreadcrumbTitle } from "@/lib/breadcrumbs";
import { useMenus } from "@/lib/online-store";
import { useSession } from "@/lib/session";

const count = (items: MenuItem[]): number =>
  items.reduce((a, i) => a + 1 + count(i.children ?? []), 0);

/** Online store → Navigation. */
export default function NavigationPage() {
  useBreadcrumbTitle("Navigation");
  const { can } = useSession();
  const menus = useMenus();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Online store"
        description="Menus for your store's header and footer. Choose which menu each one shows in the theme editor."
        primaryAction={
          can(PERMISSIONS.CONTENT_WRITE) ? (
            <Button asChild>
              <Link href="/admin/online-store/navigation/new">
                <Plus aria-hidden /> Add menu
              </Link>
            </Button>
          ) : undefined
        }
      />
      <OnlineStoreTabs />
      <Card>
        {menus.isError ? (
          <div className="p-4">
            <Alert tone="danger" title="Couldn't load menus">
              {menus.error.message}
            </Alert>
          </div>
        ) : !menus.data ? (
          <div className="p-4">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <Table>
            <caption className="sr-only">Menus</caption>
            <THead>
              <Tr>
                <Th>Menu</Th>
                <Th>Items</Th>
              </Tr>
            </THead>
            <TBody>
              {menus.data.map((m) => (
                <Tr key={m.id}>
                  <Td>
                    <Link
                      href={`/admin/online-store/navigation/${m.id}`}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {m.title}
                    </Link>
                    <p className="text-xs text-fg-muted">{m.handle}</p>
                  </Td>
                  <Td className="text-fg-muted">
                    {m.items.map((i) => i.title).join(", ") || "Empty"} ({count(m.items)})
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
