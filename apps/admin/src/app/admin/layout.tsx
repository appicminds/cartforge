"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Alert, Button, Spinner } from "@cartforge/ui";
import { AdminShell } from "@/components/shell/admin-shell";
import { ApiError } from "@/lib/api-client";
import { SessionProvider, useMeQuery } from "@/lib/session";

/**
 * Authenticated admin boundary. Nothing under /admin renders until the API has
 * confirmed the session (FE-002); a 401 sends the user to login.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const me = useMeQuery();
  const unauthenticated = me.error instanceof ApiError && me.error.status === 401;

  useEffect(() => {
    if (unauthenticated) {
      const next = window.location.pathname + window.location.search;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [unauthenticated, router]);

  if (me.isPending || unauthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-6 text-fg-muted" label="Loading your workspace" />
      </div>
    );
  }

  if (me.isError) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md items-center px-4">
        <Alert
          tone="danger"
          title="We couldn't load your account"
          action={
            <Button size="sm" variant="secondary" onClick={() => me.refetch()}>
              Retry
            </Button>
          }
        >
          {me.error.message}
          {me.error instanceof ApiError && me.error.requestId && (
            <span className="mt-1 block font-mono text-xs">Request ID: {me.error.requestId}</span>
          )}
        </Alert>
      </div>
    );
  }

  return (
    <SessionProvider user={me.data}>
      <AdminShell>{children}</AdminShell>
    </SessionProvider>
  );
}
