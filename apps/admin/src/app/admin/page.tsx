"use client";

import { useQuery } from "@tanstack/react-query";
import { Store as StoreIcon } from "lucide-react";
import { PERMISSIONS, type DetailResponse, type StoreSummary } from "@cartforge/types";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Skeleton,
} from "@cartforge/ui";
import { apiRequest } from "@/lib/api-client";
import { storeKey, useSession } from "@/lib/session";

function useStoreSettings(storeId: string | undefined) {
  return useQuery({
    queryKey: storeKey(storeId, "settings"),
    enabled: Boolean(storeId),
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<StoreSummary>>("/store", { storeId, signal }).then((r) => r.data),
  });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 text-sm text-fg-muted">{label}</dt>
      <dd className="text-sm font-medium text-fg">{value}</dd>
    </div>
  );
}

export default function AdminHome() {
  const { user, store, can } = useSession();
  const settings = useStoreSettings(store?.store_id);

  if (!store) {
    return (
      <EmptyState
        icon={<StoreIcon />}
        title="No store access yet"
        description="Your account isn't a member of any active store. Ask a store owner to invite you."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description="Here's an overview of the store you're working in."
      />

      <Card>
        <CardHeader title="Store" description="Identity and regional defaults for this store." />
        <CardBody>
          {!can(PERMISSIONS.STORE_READ) ? (
            <Alert tone="info" title="Limited access">
              Your role ({store.role_name}) can't view store settings.
            </Alert>
          ) : settings.isPending ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-5 w-full max-w-sm" />
              ))}
            </div>
          ) : settings.isError ? (
            <Alert
              tone="danger"
              title="Couldn't load store settings"
              action={
                <Button size="sm" variant="secondary" onClick={() => settings.refetch()}>
                  Retry
                </Button>
              }
            >
              {settings.error.message}
            </Alert>
          ) : (
            <dl className="divide-y divide-border" data-testid="store-settings">
              <Row label="Name" value={settings.data.name} />
              <Row label="Currency" value={settings.data.currency} />
              <Row label="Locale" value={settings.data.locale} />
              <Row label="Timezone" value={settings.data.timezone} />
              <Row label="Your role" value={store.role_name} />
            </dl>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
