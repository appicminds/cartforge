"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Alert, Spinner } from "@cartforge/ui";
import { apiRequest } from "@/lib/api-client";

/** Confirms the address as soon as the page opens (the link is single-use). */
export function VerifyEmail({ token }: { token: string }) {
  const verify = useMutation({
    mutationFn: () => apiRequest("/auth/email/verify", { method: "POST", body: { token } }),
  });
  const { mutate } = verify;
  const started = useRef(false);
  useEffect(() => {
    // Once only: the link is single-use (React may run effects twice in development).
    if (started.current) return;
    started.current = true;
    mutate();
  }, [mutate]);

  return (
    <div className="mt-6 flex flex-col gap-4" aria-live="polite">
      {verify.isError ? (
        <Alert tone="danger" title="We couldn't confirm your email">
          {verify.error.message}
        </Alert>
      ) : verify.isSuccess ? (
        <Alert tone="success" title="Your email is confirmed">
          Thanks — you can now invite your team.
        </Alert>
      ) : (
        <Spinner className="size-5" label="Confirming your email" />
      )}
      {!verify.isPending && (
        <Link
          href="/admin"
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
        >
          Go to the admin
        </Link>
      )}
    </div>
  );
}
