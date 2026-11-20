"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Copy, Download, ShieldCheck } from "lucide-react";
import type { DetailResponse, MfaSetup } from "@cartforge/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  Field,
  Input,
  Skeleton,
  useToast,
} from "@cartforge/ui";
import { ApiError, apiRequest } from "@/lib/api-client";
import { meQueryKey } from "@/lib/session";

const KEY = ["account", "mfa"];
type Status = { enabled: boolean; recovery_codes_left: number };

const fieldMsg = (err: unknown, path: string) =>
  err instanceof ApiError
    ? (err.fields.find((f) => f.path === path)?.message ??
      (err.fields.length ? undefined : err.message))
    : undefined;

/** Two-factor sign-in with an authenticator app (Your account). */
export function TwoFactorCard() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<Status>>("/auth/mfa", { signal }).then((r) => r.data),
  });
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [codesOpen, setCodesOpen] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: meQueryKey });
  };

  return (
    <Card>
      <CardHeader
        title="Two-factor sign-in"
        description="Ask for a code from an authenticator app (Google Authenticator, 1Password, Authy…) after your password."
      />
      <CardBody>
        {!status.data ? (
          <Skeleton className="h-10 w-full" />
        ) : status.data.enabled ? (
          <div className="flex flex-col gap-3">
            <p className="flex items-center gap-2 text-sm">
              <ShieldCheck aria-hidden className="size-4 text-success" />
              <Badge tone="success">On</Badge>
              {status.data.recovery_codes_left} recovery codes left
            </p>
            {status.data.recovery_codes_left <= 3 && (
              <Alert tone="warning" title="You're running out of recovery codes">
                Create new ones so you can still sign in if you lose your phone.
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setCodesOpen(true)}>
                New recovery codes
              </Button>
              <Button variant="ghost" onClick={() => setDisableOpen(true)}>
                Turn off
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-fg-muted">Off. Anyone with your password can sign in.</p>
            <Button onClick={() => setSetupOpen(true)}>Turn on two-factor sign-in</Button>
          </div>
        )}
      </CardBody>
      <SetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} onDone={refresh} />
      <DisableDialog
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        onDone={() => {
          setDisableOpen(false);
          refresh();
        }}
      />
      <NewCodesDialog open={codesOpen} onClose={() => setCodesOpen(false)} onDone={refresh} />
    </Card>
  );
}

function SetupDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [code, setCode] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const setup = useMutation({
    mutationFn: () =>
      apiRequest<DetailResponse<MfaSetup>>("/auth/mfa/setup", { method: "POST" }).then(
        (r) => r.data,
      ),
    onSuccess: async (d) => setQr(await QRCode.toDataURL(d.otpauth_url, { margin: 1, width: 192 })),
  });
  const enable = useMutation({
    mutationFn: () =>
      apiRequest<DetailResponse<{ recovery_codes: string[] }>>("/auth/mfa/enable", {
        method: "POST",
        body: { code },
      }).then((r) => r.data.recovery_codes),
    onSuccess: onDone,
  });
  const { mutate: start, reset: resetSetup } = setup;
  const { reset: resetEnable } = enable;

  useEffect(() => {
    if (open) start();
    else {
      resetSetup();
      resetEnable();
      setCode("");
      setQr(null);
    }
  }, [open, start, resetSetup, resetEnable]);

  if (enable.data)
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title="Save your recovery codes"
        description="Two-factor sign-in is on. If you lose your phone, each of these codes signs you in once. They won't be shown again."
        footer={<Button onClick={onClose}>I've saved them</Button>}
      >
        <RecoveryCodes codes={enable.data} />
      </Dialog>
    );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Turn on two-factor sign-in"
      description="Scan the QR code with your authenticator app, then enter the 6-digit code it shows."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="mfa-enable-form"
            loading={enable.isPending}
            disabled={!setup.data}
          >
            Turn on
          </Button>
        </>
      }
    >
      {setup.isError && <Alert tone="danger" title={setup.error.message} />}
      {setup.data && (
        <form
          id="mfa-enable-form"
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            enable.mutate();
          }}
        >
          <div className="flex flex-wrap items-center gap-4">
            {qr ? (
              <img
                src={qr}
                width={192}
                height={192}
                alt="QR code for your authenticator app"
                className="rounded-md border border-border bg-white"
              />
            ) : (
              <Skeleton className="size-48" />
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-fg-muted">Can't scan? Enter this key in the app:</p>
              <p className="mt-1 break-all font-mono text-xs" data-testid="mfa-secret">
                {setup.data.secret}
              </p>
            </div>
          </div>
          <Field label="6-digit code" required error={fieldMsg(enable.error, "code")}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-describedby={describedBy}
                invalid={invalid}
                value={code}
                onChange={(e) => setCode(e.target.value.trim())}
              />
            )}
          </Field>
        </form>
      )}
    </Dialog>
  );
}

function DisableDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const disable = useMutation({
    mutationFn: () => apiRequest("/auth/mfa/disable", { method: "POST", body: { password, code } }),
    onSuccess: () => {
      toast.success("Two-factor sign-in is off");
      setPassword("");
      setCode("");
      onDone();
    },
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Turn off two-factor sign-in?"
      description="Your password alone will sign you in again."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            type="submit"
            form="mfa-disable-form"
            loading={disable.isPending}
          >
            Turn off
          </Button>
        </>
      }
    >
      <form
        id="mfa-disable-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          disable.mutate();
        }}
      >
        <Field label="Password" required error={fieldMsg(disable.error, "password")}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              aria-describedby={describedBy}
              invalid={invalid}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Authentication or recovery code"
          required
          error={
            disable.error instanceof ApiError && disable.error.fields.some((f) => f.path === "code")
              ? fieldMsg(disable.error, "code")
              : undefined
          }
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              autoComplete="one-time-code"
              aria-describedby={describedBy}
              invalid={invalid}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}

function NewCodesDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [code, setCode] = useState("");
  const regen = useMutation({
    mutationFn: () =>
      apiRequest<DetailResponse<{ recovery_codes: string[] }>>("/auth/mfa/recovery-codes", {
        method: "POST",
        body: { code },
      }).then((r) => r.data.recovery_codes),
    onSuccess: onDone,
  });
  const { reset } = regen;
  useEffect(() => {
    if (!open) {
      reset();
      setCode("");
    }
  }, [open, reset]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={regen.data ? "Your new recovery codes" : "New recovery codes"}
      description={
        regen.data
          ? "Your old codes no longer work. Save these somewhere safe; they won't be shown again."
          : "Enter a code from your authenticator app. Your current recovery codes will stop working."
      }
      footer={
        regen.data ? (
          <Button onClick={onClose}>I've saved them</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="mfa-codes-form" loading={regen.isPending}>
              Create new codes
            </Button>
          </>
        )
      }
    >
      {regen.data ? (
        <RecoveryCodes codes={regen.data} />
      ) : (
        <form
          id="mfa-codes-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            regen.mutate();
          }}
        >
          <Field label="Authentication code" required error={fieldMsg(regen.error, "code")}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                autoComplete="one-time-code"
                aria-describedby={describedBy}
                invalid={invalid}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            )}
          </Field>
        </form>
      )}
    </Dialog>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const toast = useToast();
  const text = codes.join("\n");
  return (
    <div className="flex flex-col gap-3">
      <ul
        aria-label="Recovery codes"
        className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface-sunken p-3 font-mono text-sm"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              toast.success("Codes copied");
            } catch {
              toast.error("Couldn't copy — select the codes and copy them");
            }
          }}
        >
          <Copy aria-hidden /> Copy
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([`${text}\n`], { type: "text/plain" }));
            a.download = "cartforge-recovery-codes.txt";
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          <Download aria-hidden /> Download
        </Button>
      </div>
    </div>
  );
}
