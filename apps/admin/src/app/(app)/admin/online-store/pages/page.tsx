"use client";

import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { PERMISSIONS } from "@cartforge/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
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
import { PAGE_TEMPLATES } from "@/components/online-store/page-templates";
import { useBreadcrumbTitle } from "@/lib/breadcrumbs";
import { formatDateTime } from "@/lib/format";
import { usePages } from "@/lib/online-store";
import { useSession } from "@/lib/session";

/** Online store → Pages. */
export default function PagesPage() {
  useBreadcrumbTitle("Pages");
  const { can } = useSession();
  const canEdit = can(PERMISSIONS.CONTENT_WRITE);
  const pages = usePages();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Online store"
        description="Pages like About us, Contact and your policies. Add them to menus so customers can find them."
        primaryAction={
          canEdit ? (
            <Button asChild>
              <Link href="/admin/online-store/pages/new">
                <Plus aria-hidden /> Add page
              </Link>
            </Button>
          ) : undefined
        }
      />
      <OnlineStoreTabs />
      <Card>
        {pages.isError ? (
          <div className="p-4">
            <Alert tone="danger" title="Couldn't load pages">
              {pages.error.message}
            </Alert>
          </div>
        ) : !pages.data ? (
          <div className="p-4">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : pages.data.length === 0 ? (
          <div className="flex flex-col items-center gap-4 pb-8">
            <EmptyState
              icon={<FileText />}
              title="No pages yet"
              description="Most stores start with About us, Contact, and shipping and returns policies."
            />
            {canEdit && (
              <div className="flex flex-wrap justify-center gap-2">
                {PAGE_TEMPLATES.filter((t) => t.key !== "blank").map((t) => (
                  <Button key={t.key} asChild size="sm" variant="secondary">
                    <Link href={`/admin/online-store/pages/new?template=${t.key}`}>{t.title}</Link>
                  </Button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Table>
            <caption className="sr-only">Pages</caption>
            <THead>
              <Tr>
                <Th>Title</Th>
                <Th>Visibility</Th>
                <Th>Updated</Th>
              </Tr>
            </THead>
            <TBody>
              {pages.data.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <Link
                      href={`/admin/online-store/pages/${p.id}`}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {p.title}
                    </Link>
                    <p className="text-xs text-fg-muted">/pages/{p.handle}</p>
                  </Td>
                  <Td>
                    <Badge tone={p.published ? "success" : "neutral"}>
                      {p.published ? "Visible" : "Hidden"}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-fg-muted">
                    {formatDateTime(p.updated_at)}
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
