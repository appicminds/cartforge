"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreatedStore,
  DetailResponse,
  ListResponse,
  PlatformConfig,
  PlatformStoreRow,
  StoreDomainView,
} from "@cartforge/types";
import { apiRequest } from "./api-client";
import { meQueryKey, storeKey, useSession } from "./session";

/** Public edition info (sign-up link, platform domain). */
export function usePlatformConfig() {
  return useQuery({
    queryKey: ["platform", "config"],
    staleTime: 10 * 60_000,
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<PlatformConfig>>("/platform/config", { signal }).then(
        (r) => r.data,
      ),
  });
}

export function useHandleCheck(handle: string) {
  return useQuery({
    queryKey: ["platform", "handle", handle],
    enabled: handle.length >= 3,
    staleTime: 30_000,
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<{ handle: string; available: boolean; reason: string | null }>>(
        "/stores/handle-available",
        { signal, query: { handle } },
      ).then((r) => r.data),
  });
}

export function useCreateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { store_name: string; handle?: string; currency: string }) =>
      apiRequest<DetailResponse<CreatedStore>>("/stores", { method: "POST", body }).then(
        (r) => r.data,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: meQueryKey }),
  });
}

const useStoreId = () => useSession().store?.store_id;

export function useDomains() {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "domains"),
    enabled: Boolean(storeId),
    queryFn: ({ signal }) =>
      apiRequest<{ data: StoreDomainView[] }>("/domains", { storeId, signal }).then((r) => r.data),
  });
}

export function useDomainAction() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      a: { kind: "add"; hostname: string } | { kind: "verify" | "primary" | "remove"; id: string },
    ) => {
      if (a.kind === "add")
        return apiRequest("/domains", { method: "POST", body: { hostname: a.hostname }, storeId });
      if (a.kind === "remove") return apiRequest(`/domains/${a.id}`, { method: "DELETE", storeId });
      return apiRequest(`/domains/${a.id}/${a.kind}`, { method: "POST", storeId });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: storeKey(storeId, "domains") });
      void qc.invalidateQueries({ queryKey: meQueryKey }); // store URL may change
    },
  });
}

export interface PlatformStoreParams {
  q?: string;
  status?: "active" | "suspended";
  page: number;
  page_size: number;
}

export function usePlatformStores(params: PlatformStoreParams) {
  return useQuery({
    queryKey: ["platform", "stores", params],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiRequest<ListResponse<PlatformStoreRow>>("/platform/stores", {
        signal,
        query: { ...params },
      }),
  });
}

export function useUpdatePlatformStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      status: "active" | "suspended";
      reason?: string;
    }) => apiRequest(`/platform/stores/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["platform", "stores"] });
      void qc.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}

export const CURRENCIES = [
  "USD",
  "PKR",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "INR",
  "AED",
  "SGD",
  "JPY",
  "CHF",
  "SEK",
  "NZD",
];
