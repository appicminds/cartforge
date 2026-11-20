"use client";

import { useMutation } from "@tanstack/react-query";
import type { DetailResponse } from "@cartforge/types";
import { Alert, Button } from "@cartforge/ui";
import { apiRequest } from "@/lib/api-client";
import { usePlatformConfig } from "@/lib/platform";
import { useSession } from "@/lib/session";

/** Reminds new accounts to confirm their email (only when emails can actually arrive). */
export function VerifyEmailBanner() {
  const { user } = useSession();
  const config = usePlatformConfig();
  const resend = useMutation({
    mutationFn: () =>
      apiRequest<DetailResponse<{ emailed: boolean }>>("/auth/email/resend", { method: "POST" }),
  });
  if (user.email_verified || !config.data || config.data.email === "off") return null;
  return (
    <div className="mb-6">
      <Alert
        tone="info"
        title="Confirm your email address"
        action={
          <Button
            size="sm"
            variant="secondary"
            loading={resend.isPending}
            disabled={resend.isSuccess}
            onClick={() => resend.mutate()}
          >
            {resend.isSuccess ? "Sent" : "Send again"}
          </Button>
        }
      >
        We sent a link to {user.email}. Confirm it to invite your team and to make sure you can
        always reset your password.
        {resend.isError && <span className="mt-1 block">{resend.error.message}</span>}
      </Alert>
    </div>
  );
}
