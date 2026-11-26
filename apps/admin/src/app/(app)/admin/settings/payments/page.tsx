"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { PERMISSIONS, type PaymentAccountView, type ProviderInfo } from "@cartforge/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  Dialog,
  Field,
  Input,
  PageHeader,
  Skeleton,
  useToast,
} from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import { usePaymentAccountAction, usePaymentProviders } from "@/lib/payments";
import { useCheckoutSettings } from "@/lib/commerce";
import { useSession } from "@/lib/session";
import { useStoreSettings } from "@/lib/store";
import { anyManualMethod, ManualMethodsCard } from "./manual-methods";

function status(a: PaymentAccountView | undefined) {
  if (!a?.connected) return { label: "Not connected", tone: "neutral" as const };
  if (!a.enabled) return { label: "Off", tone: "neutral" as const };
  return a.mode === "live"
    ? { label: "Live", tone: "success" as const }
    : { label: "Test mode", tone: "warning" as const };
}

function CopyField({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <div className="flex gap-2">
        <Input
          readOnly
          aria-label={label}
          value={value}
          className="font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          type="button"
          variant="secondary"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              toast.success("Copied");
            } catch {
              toast.error("Couldn't copy — select it and copy");
            }
          }}
        >
          <Copy aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function ConnectDialog({
  info,
  account,
  open,
  onClose,
}: {
  info: ProviderInfo;
  account: PaymentAccountView | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const action = usePaymentAccountAction();
  const toast = useToast();
  const [mode, setMode] = useState<"test" | "live">("test");
  const [enabled, setEnabled] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setMode(account?.mode ?? "test");
    setEnabled(account?.connected ? account.enabled : true);
    setValues({ ...(account?.values ?? {}) });
    action.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when opening
  }, [open]);

  const fieldError = (key: string) =>
    action.error instanceof ApiError
      ? action.error.fields.find((f) => f.path === `credentials.${key}`)?.message
      : undefined;
  const general =
    action.error instanceof ApiError &&
    !action.error.fields.some((f) => f.path.startsWith("credentials."))
      ? action.error.message
      : action.error && !(action.error instanceof ApiError)
        ? action.error.message
        : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${account?.connected ? "Edit" : "Connect"} ${info.name}`}
      description={info.notes}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="provider-form" loading={action.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="provider-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const credentials = Object.fromEntries(
            info.fields.map((f) => [f.key, values[f.key] ?? ""]).filter(([, v]) => v !== ""),
          );
          action.mutate(
            { kind: "save", provider: info.key, body: { mode, enabled, credentials } },
            {
              onSuccess: () => {
                toast.success(`${info.name} saved`);
                onClose();
              },
            },
          );
        }}
      >
        {general && <Alert tone="danger" title={general} />}
        {info.maturity === "beta" && (
          <Alert tone="info" title="Beta">
            Built to {info.name}&apos;s published integration guide. Try a payment in test mode with
            your sandbox credentials before going live.
          </Alert>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Mode</legend>
          {(
            [
              [
                "test",
                "Test (sandbox)",
                "No real money moves. Use the provider's test credentials.",
              ],
              ["live", "Live", "Real payments. Use your live credentials."],
            ] as const
          ).map(([value, label, hint]) => (
            <label key={value} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <span className="font-medium">{label}</span>
                <span className="block text-fg-muted">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {info.fields.map((f) => {
          const saved = account?.set_fields.includes(f.key);
          return (
            <Field
              key={f.key}
              label={f.label}
              required={f.required && !saved}
              error={fieldError(f.key)}
              hint={f.secret && saved ? "Saved. Leave empty to keep it." : f.hint}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  aria-describedby={describedBy}
                  invalid={invalid}
                  placeholder={f.secret && saved ? "••••••••" : undefined}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
              )}
            </Field>
          );
        })}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Offer {info.name} at checkout
        </label>
        {account && (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <p className="text-sm text-fg-muted">
              In {info.name}&apos;s merchant portal, register these addresses so payments are
              confirmed even if the customer closes their browser:
            </p>
            <CopyField label="Notification (webhook / IPN) URL" value={account.webhook_url} />
            <CopyField label="Return URL" value={account.return_url} />
          </div>
        )}
      </form>
    </Dialog>
  );
}

/** Settings → Payments: card and wallet gateways (Next 5). */
export default function PaymentsPage() {
  const { can } = useSession();
  const canEdit = can(PERMISSIONS.PAYMENTS_SECRETS);
  const canEditManual = can(PERMISSIONS.STORE_SETTINGS_WRITE);
  const q = usePaymentProviders();
  const checkout = useCheckoutSettings();
  const store = useStoreSettings();
  const currency = store.data?.currency;
  const gatewayOn = q.data?.accounts.some((a) => a.connected && a.enabled) ?? false;
  const closed =
    checkout.data && currency && q.data && !gatewayOn && !anyManualMethod(checkout.data, currency);
  const action = usePaymentAccountAction();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ProviderInfo | null>(null);

  const accountOf = (key: string) => q.data?.accounts.find((a) => a.provider === key);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payments"
        description="Everything customers can pay with: online gateways that confirm payments automatically, and manual methods you confirm yourself."
      />
      {closed && (
        <Alert tone="warning" title="Customers can't pay yet">
          Turn on a manual method below, or connect a gateway, so customers can place orders.
        </Alert>
      )}
      {!canEdit && (
        <Alert tone="info" title="View only">
          Only the store owner or an administrator can connect payment providers.
        </Alert>
      )}
      {q.isError ? (
        <Alert tone="danger" title="Couldn't load payment providers">
          {q.error.message}
        </Alert>
      ) : !q.data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2" aria-label="Payment providers">
          {q.data.providers.map((info) => {
            const a = accountOf(info.key);
            const st = status(a);
            const fits = !currency || !info.currencies || info.currencies.includes(currency);
            return (
              <li key={info.key}>
                <Card className="h-full">
                  <CardBody className="flex h-full flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold">{info.name}</h2>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {info.maturity === "beta" && <Badge>Beta</Badge>}
                    </div>
                    {!fits && (
                      <p className="text-sm text-warning">
                        Not available: {info.name} takes {info.currencies!.join(", ")} only, and
                        this store sells in {currency}.
                      </p>
                    )}
                    <p className="text-sm text-fg-muted">{info.notes}</p>
                    <p className="text-xs text-fg-subtle">
                      {info.currencies
                        ? `Currency: ${info.currencies.join(", ")}`
                        : "Most currencies"}
                      {" · "}
                      {info.refunds
                        ? "Refunds go back automatically"
                        : "Refunds are recorded; send them in the provider's portal"}
                    </p>
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                      {canEdit && (fits || a?.connected) && (
                        <Button
                          variant={a?.connected ? "secondary" : "primary"}
                          size="sm"
                          onClick={() => setEditing(info.key)}
                          aria-label={`${a?.connected ? "Edit" : "Connect"} ${info.name}`}
                        >
                          {a?.connected ? "Edit" : "Connect"}
                        </Button>
                      )}
                      {canEdit && a?.connected && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRemoving(info)}
                          aria-label={`Disconnect ${info.name}`}
                        >
                          Disconnect
                        </Button>
                      )}
                      <a
                        href={info.signup_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-sm text-primary underline underline-offset-2"
                      >
                        Get an account
                        <ExternalLink aria-hidden className="size-3.5" />
                        <span className="sr-only">(opens {info.name} in a new tab)</span>
                      </a>
                    </div>
                  </CardBody>
                </Card>
                <ConnectDialog
                  info={info}
                  account={a}
                  open={editing === info.key}
                  onClose={() => setEditing(null)}
                />
              </li>
            );
          })}
        </ul>
      )}
      <section aria-labelledby="manual-h" className="flex flex-col gap-3">
        <h2 id="manual-h" className="sr-only">
          Manual payment methods
        </h2>
        {checkout.isError ? (
          <Alert tone="danger" title="Couldn't load payment methods">
            {checkout.error.message}
          </Alert>
        ) : checkout.data && currency ? (
          <ManualMethodsCard settings={checkout.data} currency={currency} canEdit={canEditManual} />
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
      </section>
      <ConfirmDialog
        open={removing !== null}
        title={`Disconnect ${removing?.name ?? "provider"}?`}
        description="Customers can't choose it any more and its saved credentials are deleted. Orders already paid aren't affected."
        confirmLabel="Disconnect"
        destructive
        pending={action.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() =>
          removing &&
          action.mutate(
            { kind: "remove", provider: removing.key },
            {
              onSuccess: () => {
                toast.success(`${removing.name} disconnected`);
                setRemoving(null);
              },
              onError: (e) => toast.error(e.message),
            },
          )
        }
      />
    </div>
  );
}
