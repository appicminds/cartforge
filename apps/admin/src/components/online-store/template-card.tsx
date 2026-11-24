"use client";

import Link from "next/link";
import { useId } from "react";
import { PERMISSIONS, type TemplateTargetKind } from "@cartforge/types";
import { Card, CardBody, CardHeader, Select, useToast } from "@cartforge/ui";
import { useAssignTemplate, useTemplateAssignment } from "@/lib/online-store";
import { useSession } from "@/lib/session";

const WRITE = {
  product: PERMISSIONS.PRODUCTS_WRITE,
  collection: PERMISSIONS.COLLECTIONS_WRITE,
  page: PERMISSIONS.CONTENT_WRITE,
} as const;

/** "Theme template": which of the theme's layouts this product / collection / page uses. */
export function ThemeTemplateCard({
  kind,
  id,
  className,
}: {
  kind: TemplateTargetKind;
  id: string;
  className?: string;
}) {
  const toast = useToast();
  const { can } = useSession();
  const q = useTemplateAssignment(kind, id);
  const assign = useAssignTemplate(kind, id);
  const selectId = useId();
  if (!q.data) return null;
  const { template, available } = q.data;
  return (
    <Card className={className}>
      <CardHeader title="Theme template" />
      <CardBody className="flex flex-col gap-2 text-sm">
        {available.length === 0 && !template ? (
          <p className="text-fg-muted">
            Uses the default layout. To give some {kind}s a different layout, create a template in
            the{" "}
            <Link href="/admin/online-store" className="text-primary underline underline-offset-2">
              theme editor
            </Link>
            .
          </p>
        ) : (
          <>
            <label htmlFor={selectId} className="sr-only">
              Theme template
            </label>
            <Select
              id={selectId}
              value={template ?? ""}
              disabled={!can(WRITE[kind]) || assign.isPending}
              onChange={(e) =>
                assign.mutate(e.target.value || null, {
                  onSuccess: () => toast.success("Theme template saved"),
                  onError: (err) => toast.error(err.message),
                })
              }
            >
              <option value="">Default</option>
              {[...new Set([...available, ...(template ? [template] : [])])].map((n) => (
                <option key={n} value={n}>
                  {n}
                  {available.includes(n) ? "" : " (missing — shows the default)"}
                </option>
              ))}
            </Select>
            <p className="text-xs text-fg-muted">Templates come from your live theme.</p>
          </>
        )}
      </CardBody>
    </Card>
  );
}
