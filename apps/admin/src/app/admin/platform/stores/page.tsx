"use client";

import { useState } from "react";
import { Building2, Search } from "lucide-react";
import type { PlatformStoreRow } from "@cartforge/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pagination,
  Skeleton,
  TBody,
  THead,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
  Tr,
  useToast,
} from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import {
  usePlatformStores,
  useUpdatePlatformStore,
  type PlatformStoreParams,
} from "@/lib/platform";
import { useSession } from "@/lib/session";
import { useDebounced } from "@/lib/use-debounced";
import { ResetLinkDialog } from "./reset-link-dialog";
import { TransferDialog } from "./transfer-dialog";

type Tab = "all" | "active" | "suspended";

function SuspendDialog({
  store,
  onClose,
}: {
  store: PlatformStoreRow | null;
  onClose: () => void;
}) {
  const update = useUpdatePlatformStore();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const err =
    update.error instanceof ApiError
      ? update.error.fields.find((f) => f.path === "reason")?.message
      : undefined;
  return (
    <Dialog
      open={store !== null}
      onClose={onClose}
      title={`Suspend ${store?.name ?? "store"}?`}
      description="Its storefront goes offline and its staff can't open the admin until you reactivate it. No data is deleted."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            type="submit"
            form="suspend-form"
            loading={update.isPending}
          >
            Suspend store
          </Button>
        </>
      }
    >
      <form
        id="suspend-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!store) return;
          update.mutate(
            { id: store.id, status: "suspended", reason },
            {
              onSuccess: () => {
                toast.success(`${store.name} suspended`);
                setReason("");
                onClose();
              },
            },
          );
        }}
      >
        <Field
          label="Reason"
          required
          error={err}
          hint="Shown to the platform team; keep it factual."
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}

/** Platform operators: every store on the installation (P1). */
export default function PlatformStoresPage() {
  const { user } = useSession();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const q = useDebounced(search.trim(), 300);
  const params: PlatformStoreParams = {
    q: q || undefined,
    status: tab === "all" ? undefined : tab,
    page,
    page_size: pageSize,
  };
  const list = usePlatformStores(params);
  const update = useUpdatePlatformStore();
  const toast = useToast();
  const [suspending, setSuspending] = useState<PlatformStoreRow | null>(null);
  const [moving, setMoving] = useState<PlatformStoreRow | null>(null);
  const [resetting, setResetting] = useState<PlatformStoreRow | null>(null);

  if (!user.is_platform_admin) {
    return (
      <Alert tone="danger" title="Platform administrators only">
        You don't have access to this page.
      </Alert>
    );
  }
  const data = list.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="All stores"
        description="Every store on this platform. Suspend a store to take it offline without deleting anything."
      />
      <Card>
        <div className="flex flex-col gap-2 border-b border-border p-2 sm:flex-row sm:items-center">
          <Tabs<Tab>
            label="Store status"
            controls="platform-stores"
            value={tab}
            onChange={(t) => {
              setTab(t);
              setPage(1);
            }}
            items={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "suspended", label: "Suspended" },
            ]}
          />
          <div className="relative flex-1 sm:ml-auto sm:max-w-80" role="search">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
            />
            <Input
              type="search"
              aria-label="Search stores"
              placeholder="Name, address, domain or owner email"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-8"
            />
          </div>
        </div>
        <div id="platform-stores" role="tabpanel" aria-label="Stores">
          {list.isError ? (
            <div className="p-4">
              <Alert tone="danger" title="Couldn't load stores">
                {list.error.message}
              </Alert>
            </div>
          ) : data && data.data.length === 0 ? (
            <EmptyState
              icon={<Building2 />}
              title="No stores match"
              description="Try another search or status."
            />
          ) : (
            <>
              <Table aria-busy={list.isFetching || undefined}>
                <caption className="sr-only">Stores</caption>
                <THead>
                  <tr>
                    <Th>Store</Th>
                    <Th>Owner</Th>
                    <Th>Plan</Th>
                    <Th className="text-right">Products</Th>
                    <Th className="text-right">Orders</Th>
                    <Th>Created</Th>
                    <Th>Status</Th>
                    <Th className="text-right">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </THead>
                <TBody>
                  {!data
                    ? Array.from({ length: 5 }, (_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 8 }, (_, j) => (
                            <Td key={j}>
                              <Skeleton className="h-4 w-16" />
                            </Td>
                          ))}
                        </tr>
                      ))
                    : data.data.map((s) => (
                        <Tr key={s.id}>
                          <Td className="max-w-72">
                            <span className="block truncate font-medium">{s.name}</span>
                            <span className="block truncate text-xs text-fg-muted">
                              {s.primary_domain ?? s.handle}
                            </span>
                          </Td>
                          <Td className="max-w-56 text-fg-muted">
                            <span className="block truncate">{s.owner_email ?? "—"}</span>
                            {s.owner_email && (
                              <button
                                type="button"
                                onClick={() => setResetting(s)}
                                aria-label={`Password reset link for ${s.owner_email}`}
                                className="text-xs text-primary underline underline-offset-2"
                              >
                                Password reset link
                              </button>
                            )}
                          </Td>
                          <Td>
                            <Badge>{s.plan}</Badge>
                          </Td>
                          <Td className="text-right tabular-nums">{s.product_count}</Td>
                          <Td className="text-right tabular-nums">{s.order_count}</Td>
                          <Td className="whitespace-nowrap text-fg-muted">
                            {formatDate(s.created_at)}
                          </Td>
                          <Td>
                            <Badge tone={s.status === "active" ? "success" : "danger"}>
                              {s.status === "active" ? "Active" : "Suspended"}
                            </Badge>
                            {s.suspension_reason && (
                              <span
                                className="mt-0.5 block max-w-48 truncate text-xs text-fg-muted"
                                title={s.suspension_reason}
                              >
                                {s.suspension_reason}
                              </span>
                            )}
                          </Td>
                          <Td className="whitespace-nowrap text-right">
                            {s.product_count > 0 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="mr-2"
                                onClick={() => setMoving(s)}
                                aria-label={`Move products from ${s.name}`}
                              >
                                Move products
                              </Button>
                            )}
                            {s.status === "active" ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setSuspending(s)}
                                aria-label={`Suspend ${s.name}`}
                              >
                                Suspend
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="secondary"
                                aria-label={`Reactivate ${s.name}`}
                                onClick={() =>
                                  update.mutate(
                                    { id: s.id, status: "active" },
                                    {
                                      onSuccess: () => toast.success(`${s.name} reactivated`),
                                      onError: (e) => toast.error(e.message),
                                    },
                                  )
                                }
                              >
                                Reactivate
                              </Button>
                            )}
                          </Td>
                        </Tr>
                      ))}
                </TBody>
              </Table>
              {data && (
                <Pagination
                  className="border-t border-border p-3"
                  page={data.meta.page}
                  pageSize={data.meta.page_size}
                  total={data.meta.total}
                  totalPages={data.meta.total_pages}
                  pageSizes={[25, 50, 100]}
                  onPageChange={setPage}
                  onPageSizeChange={(n) => {
                    setPageSize(n);
                    setPage(1);
                  }}
                />
              )}
            </>
          )}
        </div>
      </Card>
      <SuspendDialog store={suspending} onClose={() => setSuspending(null)} />
      <TransferDialog store={moving} onClose={() => setMoving(null)} />
      <ResetLinkDialog store={resetting} onClose={() => setResetting(null)} />
    </div>
  );
}
