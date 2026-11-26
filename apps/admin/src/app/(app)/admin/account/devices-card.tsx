"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Laptop } from "lucide-react";
import type { DetailResponse, SessionView } from "@cartforge/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Skeleton,
  useToast,
} from "@cartforge/ui";
import { apiRequest } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

const KEY = ["account", "sessions"];

/** Where you're signed in; sign out a lost device or everywhere else. */
export function DevicesCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const sessions = useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<SessionView[]>>("/auth/sessions", { signal }).then((r) => r.data),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiRequest(`/auth/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => toast.success("Signed out of that device"),
    onError: (e) => toast.error(e.message),
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
  const others = useMutation({
    mutationFn: () =>
      apiRequest<DetailResponse<{ signed_out: number }>>("/auth/sessions/sign-out-others", {
        method: "POST",
      }),
    onSuccess: (r) =>
      toast.success(
        r.data.signed_out === 1
          ? "Signed out of 1 other device"
          : `Signed out of ${r.data.signed_out} other devices`,
      ),
    onError: (e) => toast.error(e.message),
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
  const hasOthers = (sessions.data?.length ?? 0) > 1;

  return (
    <Card>
      <CardHeader
        title="Signed-in devices"
        description="Browsers and devices where you're signed in. Sign out any you don't recognise, then change your password."
        actions={
          hasOthers ? (
            <Button
              variant="secondary"
              size="sm"
              loading={others.isPending}
              onClick={() => others.mutate()}
            >
              Sign out everywhere else
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        {sessions.isError ? (
          <Alert tone="danger" title="Couldn't load your devices">
            {sessions.error.message}
          </Alert>
        ) : !sessions.data ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <ul className="divide-y divide-border" aria-label="Signed-in devices">
            {sessions.data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <Laptop aria-hidden className="size-4 text-fg-muted" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {s.device}
                    {s.current && <Badge tone="primary">This device</Badge>}
                  </p>
                  <p className="text-sm text-fg-muted">
                    Last active {formatDateTime(s.last_seen_at)}
                    {s.ip && <> · {s.ip}</>} · signed in {formatDateTime(s.created_at)}
                  </p>
                </div>
                {!s.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(s.id)}
                    aria-label={`Sign out ${s.device}, last active ${formatDateTime(s.last_seen_at)}`}
                  >
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
