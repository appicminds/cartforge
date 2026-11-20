"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ActorSummary } from "@cartforge/types";
import { Alert, Button, Card, CardBody, CardHeader, Skeleton } from "@cartforge/ui";
import { apiRequest } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { storeKey, useSession } from "@/lib/session";

interface ActivityEntry {
  id: string;
  at: string;
  actor: ActorSummary | null;
  kind: "audit" | "stock";
  action: string;
  summary: string;
}

/** Product timeline (PRD §8.5): status and catalog changes plus stock movements. */
export function ActivityCard({ productId, version }: { productId: string; version: string }) {
  const storeId = useSession().store?.store_id;
  const [all, setAll] = useState(false);
  const activity = useQuery({
    // `version` (updated_at + stock) refetches after any change on the page.
    queryKey: storeKey(storeId, "products", "activity", productId, version),
    enabled: Boolean(storeId),
    queryFn: ({ signal }) =>
      apiRequest<{ data: ActivityEntry[] }>(`/products/${productId}/activity`, {
        storeId,
        signal,
      }).then((r) => r.data),
  });
  const rows = activity.data ?? [];
  const shown = all ? rows : rows.slice(0, 6);

  return (
    <Card>
      <CardHeader title="Activity" />
      <CardBody>
        {activity.isPending ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : activity.isError ? (
          <Alert tone="danger" title="Couldn't load activity" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-fg-muted">No activity yet.</p>
        ) : (
          <>
            <ol
              aria-label="Product activity"
              className="relative flex flex-col gap-3 border-l border-border pl-4"
            >
              {shown.map((e) => (
                <li key={e.id} className="relative text-sm">
                  <span
                    aria-hidden
                    className={`absolute -left-[1.3rem] top-1.5 size-2 rounded-full ${e.kind === "stock" ? "bg-info" : "bg-primary"}`}
                  />
                  <p className="text-fg">{e.summary}</p>
                  <p className="text-xs text-fg-muted">
                    {formatDateTime(e.at)}
                    {e.actor && <> · {e.actor.name}</>}
                  </p>
                </li>
              ))}
            </ol>
            {rows.length > 6 && (
              <Button
                variant="link"
                size="sm"
                className="mt-2 h-auto px-0"
                onClick={() => setAll((a) => !a)}
              >
                {all ? "Show less" : `Show all ${rows.length}`}
              </Button>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
