"use client";

import { useState } from "react";
import { Copy, Globe, Trash2 } from "lucide-react";
import { PERMISSIONS, type StoreDomainView } from "@cartforge/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Field,
  Input,
  PageHeader,
  Skeleton,
  useToast,
} from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import { useDomainAction, useDomains, usePlatformConfig } from "@/lib/platform";
import { useSession } from "@/lib/session";

function DnsTable({ d }: { d: StoreDomainView }) {
  const toast = useToast();
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">DNS records for {d.hostname}</caption>
        <thead className="bg-surface-sunken text-fg-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Value</th>
            <th className="px-3 py-2 font-medium">Why</th>
          </tr>
        </thead>
        <tbody>
          {d.dns.map((r) => (
            <tr key={r.type + r.name} className="border-t border-border align-top">
              <td className="px-3 py-2 font-mono">{r.type}</td>
              <td className="px-3 py-2 font-mono break-all">{r.name}</td>
              <td className="px-3 py-2 font-mono break-all">
                <span>{r.value}</span>
                <button
                  type="button"
                  className="ml-2 inline-flex align-middle text-fg-muted hover:text-fg"
                  aria-label={`Copy ${r.type} value`}
                  onClick={() => {
                    void navigator.clipboard?.writeText(r.value);
                    toast.success("Copied");
                  }}
                >
                  <Copy aria-hidden className="size-3.5" />
                </button>
              </td>
              <td className="px-3 py-2 text-fg-muted">{r.purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DomainsPage() {
  const { can } = useSession();
  const canEdit = can(PERMISSIONS.STORE_SETTINGS_WRITE);
  const domains = useDomains();
  const config = usePlatformConfig();
  const action = useDomainAction();
  const toast = useToast();
  const [hostname, setHostname] = useState("");
  const [removing, setRemoving] = useState<StoreDomainView | null>(null);
  const fieldError =
    action.error instanceof ApiError && action.variables?.kind === "add"
      ? (action.error.fields.find((f) => f.path === "hostname")?.message ?? action.error.message)
      : undefined;

  const run = (a: Parameters<typeof action.mutate>[0], ok: string) =>
    action.mutate(a, {
      onSuccess: () => toast.success(ok),
      onError: (err) => a.kind !== "add" && toast.error(err.message),
    });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Domains"
        description="Where customers find your store. Your primary domain is used in links, sitemaps and order emails."
      />
      {!canEdit && (
        <Alert tone="info" title="View only">
          Your role can see domains but not change them.
        </Alert>
      )}

      <Card>
        <CardHeader title="Your domains" />
        <CardBody>
          {domains.isError ? (
            <Alert tone="danger" title="Couldn't load domains">
              {domains.error.message}
            </Alert>
          ) : !domains.data ? (
            <Skeleton className="h-24 w-full" />
          ) : domains.data.length === 0 ? (
            <p className="text-sm text-fg-muted">
              No domains yet.{" "}
              {config.data?.edition === "self_hosted"
                ? "Point your domain at this server, then add it below."
                : "Connect a domain you own below."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {domains.data.map((d) => (
                <li key={d.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Globe aria-hidden className="size-4 text-fg-muted" />
                    <span className="font-medium">{d.hostname}</span>
                    {d.is_primary && <Badge tone="primary">Primary</Badge>}
                    {d.kind === "platform" && <Badge>Platform address</Badge>}
                    <Badge tone={d.status === "active" ? "success" : "warning"}>
                      {d.status === "active" ? "Connected" : "Waiting for DNS"}
                    </Badge>
                    <div className="ml-auto flex gap-2">
                      {d.status === "active" && (
                        <Button asChild size="sm" variant="ghost">
                          <a
                            href={`https://${d.hostname}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Visit
                          </a>
                        </Button>
                      )}
                      {canEdit && d.status === "pending" && (
                        <Button
                          size="sm"
                          loading={action.isPending && action.variables?.kind === "verify"}
                          onClick={() => run({ kind: "verify", id: d.id }, "Domain connected")}
                        >
                          Verify
                        </Button>
                      )}
                      {canEdit && d.status === "active" && !d.is_primary && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            run({ kind: "primary", id: d.id }, "Primary domain changed")
                          }
                        >
                          Make primary
                        </Button>
                      )}
                      {canEdit && d.kind === "custom" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${d.hostname}`}
                          onClick={() => setRemoving(d)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      )}
                    </div>
                  </div>
                  {d.status === "pending" && (
                    <div className="mt-2 text-sm">
                      <p className="text-fg-muted">
                        Add these records at your domain provider, then choose{" "}
                        <strong>Verify</strong>.
                      </p>
                      {d.last_error && <p className="mt-1 text-warning">{d.last_error}</p>}
                      <DnsTable d={d} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {canEdit && (
        <Card>
          <CardHeader
            title="Connect a domain"
            description="Use a domain you already own, like shop.example.com."
          />
          <CardBody>
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-start"
              onSubmit={(e) => {
                e.preventDefault();
                action.mutate(
                  { kind: "add", hostname },
                  {
                    onSuccess: () => {
                      toast.success("Domain added — now add the DNS records");
                      setHostname("");
                    },
                  },
                );
              }}
            >
              <div className="flex-1">
                <Field label="Domain" error={fieldError}>
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      invalid={invalid}
                      placeholder="shop.example.com"
                      value={hostname}
                      onChange={(e) => setHostname(e.target.value)}
                    />
                  )}
                </Field>
              </div>
              <Button
                type="submit"
                className="sm:mt-6"
                disabled={!hostname.trim()}
                loading={action.isPending && action.variables?.kind === "add"}
              >
                Add domain
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={`Disconnect ${removing?.hostname ?? "domain"}?`}
        description="Customers using this address won't reach your store anymore."
        confirmLabel="Disconnect"
        destructive
        pending={action.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() =>
          removing &&
          action.mutate(
            { kind: "remove", id: removing.id },
            {
              onSuccess: () => {
                toast.success("Domain disconnected");
                setRemoving(null);
              },
              onError: (err) => toast.error(err.message),
            },
          )
        }
      />
    </div>
  );
}
