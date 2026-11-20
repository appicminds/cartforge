"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Plus, Store as StoreIcon } from "lucide-react";
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
  Select,
  useToast,
} from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import { CURRENCIES, useCreateStore, usePlatformConfig } from "@/lib/platform";
import { useSession } from "@/lib/session";

function CreateStoreDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateStore();
  const config = usePlatformConfig();
  const { setStoreId } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const errors: Record<string, string> = {};
  if (create.error instanceof ApiError)
    for (const f of create.error.fields) errors[f.path] ??= f.message;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create another store"
      description="Each store has its own products, orders, staff, settings and address."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-store" loading={create.isPending}>
            Create store
          </Button>
        </>
      }
    >
      <form
        id="create-store"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(
            { store_name: name, currency },
            {
              onSuccess: (s) => {
                toast.success(`${s.name} is ready`);
                setStoreId(s.store_id);
                onClose();
                router.push("/admin");
              },
            },
          );
        }}
      >
        {create.isError && !Object.keys(errors).length && (
          <Alert tone="danger" title={create.error.message} />
        )}
        <Field
          label="Store name"
          required
          error={errors.store_name ?? errors.handle}
          hint={
            config.data?.platform_domain
              ? `You'll get an address on ${config.data.platform_domain} and can connect your own domain later.`
              : undefined
          }
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Currency" hint="Prices and orders use one currency per store.">
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </Dialog>
  );
}

/** Shopify-style store chooser: the admin works in one store at a time. */
export default function StoresPage() {
  const { user, store, setStoreId } = useSession();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const open = (id: string) => {
    setStoreId(id);
    router.push("/admin");
  };
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="Your stores"
        description={
          store ? `You're working in ${store.store_name}.` : "Choose the store you want to work in."
        }
        primaryAction={
          user.can_create_stores ? (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden /> Create store
            </Button>
          ) : undefined
        }
      />
      {user.stores.length === 0 ? (
        <EmptyState
          icon={<StoreIcon />}
          title="No stores yet"
          description={
            user.can_create_stores
              ? "Create your first store to start selling."
              : "Your account isn't a member of any store. Ask a store owner to invite you."
          }
          action={
            user.can_create_stores ? (
              <Button onClick={() => setCreating(true)}>Create store</Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {user.stores.map((s) => {
              const suspended = s.store_status !== "active";
              const current = store?.store_id === s.store_id;
              return (
                <li key={s.store_id} className="flex flex-wrap items-center gap-4 p-4">
                  <span
                    aria-hidden
                    className="flex size-10 items-center justify-center rounded-lg bg-primary-subtle font-semibold text-primary"
                  >
                    {s.store_name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {s.store_name}
                      {current && <Badge tone="primary">Current</Badge>}
                      {suspended && <Badge tone="danger">Suspended</Badge>}
                    </p>
                    <p className="truncate text-sm text-fg-muted">
                      {s.role_name}
                      {s.store_url && <> · {s.store_url.replace(/^https:\/\//, "")}</>}
                    </p>
                    {suspended && (
                      <p className="mt-1 text-sm text-danger">
                        This store is suspended. Contact the platform team.
                      </p>
                    )}
                  </div>
                  {(s.store_url ?? s.store_preview_url) && !suspended && (
                    <Button asChild variant="ghost" size="sm">
                      <a
                        href={(s.store_url ?? s.store_preview_url)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${s.store_url ? "View" : "Preview"} ${s.store_name} storefront`}
                      >
                        <ExternalLink aria-hidden />
                      </a>
                    </Button>
                  )}
                  <Button
                    variant={current ? "secondary" : "primary"}
                    disabled={suspended}
                    onClick={() => open(s.store_id)}
                    aria-label={`${current ? "Continue in" : "Open"} ${s.store_name}`}
                  >
                    {current ? "Continue" : "Open"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {user.is_platform_admin && (
        <p className="text-sm text-fg-muted">
          You also run the platform.{" "}
          <a href="/admin/platform/stores" className="text-primary underline underline-offset-2">
            Manage all stores
          </a>
        </p>
      )}
      <CreateStoreDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
