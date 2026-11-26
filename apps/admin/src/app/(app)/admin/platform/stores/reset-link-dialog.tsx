"use client";

import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import type { DetailResponse, PlatformStoreRow } from "@cartforge/types";
import { Alert, Button, Dialog, Input, Spinner, useToast } from "@cartforge/ui";
import { apiRequest } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

interface ResetLink {
  email: string;
  url: string;
  expires_at: string;
}

/**
 * Platform admin: a one-time password reset link for a store owner, to send them
 * through a channel you trust (it isn't emailed). Creating it is audited.
 */
export function ResetLinkDialog({
  store,
  onClose,
}: {
  store: PlatformStoreRow | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const create = useMutation({
    mutationFn: (email: string) =>
      apiRequest<DetailResponse<ResetLink>>("/platform/users/reset-link", {
        method: "POST",
        body: { email },
      }),
  });
  const { mutate, reset } = create;
  const mfaReset = useMutation({
    mutationFn: (email: string) =>
      apiRequest("/platform/users/mfa-reset", { method: "POST", body: { email } }),
    onSuccess: () => toast.success("Two-factor sign-in turned off"),
    onError: (e) => toast.error(e.message),
  });
  const { reset: resetMfa } = mfaReset;

  useEffect(() => {
    reset();
    resetMfa();
    if (store?.owner_email) mutate(store.owner_email);
  }, [store?.id, store?.owner_email, mutate, reset, resetMfa]);

  const link = create.data?.data;
  return (
    <Dialog
      open={store !== null}
      onClose={onClose}
      title="Password reset link"
      description={`For ${store?.owner_email ?? "the owner"}, owner of ${store?.name ?? "this store"}.`}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {create.isPending && <Spinner className="size-5" label="Creating link" />}
      {create.isError && <Alert tone="danger" title={create.error.message} />}
      {link && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              readOnly
              aria-label="Reset link"
              value={link.url}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link.url);
                  toast.success("Link copied");
                } catch {
                  toast.error("Couldn't copy — select the link and copy it");
                }
              }}
            >
              <Copy aria-hidden /> Copy
            </Button>
          </div>
          <p className="text-sm text-fg-muted">
            Works once, until {formatDateTime(link.expires_at)}. Send it only to the owner — anyone
            with the link can set the password. Their other sign-ins end when they use it.
          </p>
          <div className="border-t border-border pt-3 text-sm">
            <p className="text-fg-muted">
              Lost their phone and recovery codes too? After checking it&apos;s really them, you can
              turn off their two-factor sign-in.
            </p>
            <Button
              className="mt-2"
              variant="secondary"
              size="sm"
              loading={mfaReset.isPending}
              disabled={mfaReset.isSuccess}
              onClick={() => mfaReset.mutate(link.email)}
            >
              Turn off two-factor sign-in
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
