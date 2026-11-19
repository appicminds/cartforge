"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  CurrentUser,
  DetailResponse,
  Permission,
  StoreMembershipSummary,
} from "@cartforge/types";
import { ApiError, apiRequest } from "./api-client";

const STORE_KEY = "cf:active-store";

export const meQueryKey = ["auth", "me"] as const;

export function useMeQuery() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<CurrentUser>>("/auth/me", { signal }).then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

interface SessionValue {
  user: CurrentUser;
  store: StoreMembershipSummary | null;
  setStoreId: (id: string) => void;
  can: (p: Permission) => boolean;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

function readStoredStore(): string | null {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

export function SessionProvider({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [storeId, setStoreIdState] = useState<string | null>(null);

  useEffect(() => {
    const saved = readStoredStore();
    const valid = user.stores.find((s) => s.store_id === saved);
    setStoreIdState(valid?.store_id ?? user.stores[0]?.store_id ?? null);
  }, [user.stores]);

  const setStoreId = useCallback(
    (id: string) => {
      setStoreIdState(id);
      try {
        localStorage.setItem(STORE_KEY, id);
      } catch {
        // Storage unavailable (private mode): selection just won't persist.
      }
      // Drop every store-scoped cache entry so no data from the previous store lingers.
      qc.removeQueries({ predicate: (q) => q.queryKey[0] === "store" });
    },
    [qc],
  );

  const store = user.stores.find((s) => s.store_id === storeId) ?? null;

  const logout = useCallback(async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch (err) {
      // An already-expired session is effectively logged out.
      if (!(err instanceof ApiError) || err.status !== 401) throw err;
    } finally {
      qc.clear();
    }
    router.replace("/login");
  }, [qc, router]);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      store,
      setStoreId,
      can: (p) => store?.permissions.includes(p) ?? false,
      logout,
    }),
    [user, store, setStoreId, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

/** Query key helper: every store-scoped query starts with ["store", storeId, …]. */
export function storeKey(storeId: string | undefined, ...rest: unknown[]) {
  return ["store", storeId ?? "none", ...rest] as const;
}
