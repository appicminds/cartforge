"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Alert, Button } from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";

/**
 * Route-level error boundary (FE-008). Reports route + request ID only — never
 * request bodies, cookies or credentials. Wire to Sentry-compatible monitoring later.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const requestId = error instanceof ApiError ? error.requestId : null;

  useEffect(() => {
    console.error("[admin] route error", {
      route: pathname,
      request_id: requestId,
      digest: error.digest,
      name: error.name,
    });
  }, [error, pathname, requestId]);

  return (
    <Alert
      tone="danger"
      title="Something went wrong on this page"
      action={
        <Button size="sm" variant="secondary" onClick={reset}>
          Try again
        </Button>
      }
    >
      If this keeps happening, contact your administrator
      {requestId ? (
        <>
          {" "}
          with request ID <code className="font-mono text-xs">{requestId}</code>.
        </>
      ) : (
        "."
      )}
    </Alert>
  );
}
