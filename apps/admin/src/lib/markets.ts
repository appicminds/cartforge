"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DetailResponse, MarketsOverview, ProductMarketsView } from "@cartforge/types";
import type { MarketInput, ProductMarketsInput } from "@cartforge/validation";
import { apiRequest } from "./api-client";
import { storeKey, useSession } from "./session";

const useStoreId = () => useSession().store?.store_id;

export function useMarkets() {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "markets"),
    enabled: Boolean(storeId),
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<MarketsOverview>>("/markets", { storeId, signal }).then(
        (r) => r.data,
      ),
  });
}

export function useMarketAction() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      a: { kind: "save"; id?: string; body: MarketInput } | { kind: "remove"; id: string },
    ) =>
      a.kind === "remove"
        ? apiRequest(`/markets/${a.id}`, { method: "DELETE", storeId })
        : apiRequest(a.id ? `/markets/${a.id}` : "/markets", {
            method: a.id ? "PUT" : "POST",
            body: a.body,
            storeId,
          }),
    onSettled: () => void qc.invalidateQueries({ queryKey: storeKey(storeId, "markets") }),
  });
}

export function useProductMarkets(productId: string | undefined) {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "product-markets", productId),
    enabled: Boolean(storeId && productId),
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<ProductMarketsView>>(`/products/${productId}/markets`, {
        storeId,
        signal,
      }).then((r) => r.data),
  });
}

export function useSaveProductMarkets(productId: string) {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProductMarketsInput) =>
      apiRequest<DetailResponse<ProductMarketsView>>(`/products/${productId}/markets`, {
        method: "PUT",
        body,
        storeId,
      }).then((r) => r.data),
    onSuccess: (data) => qc.setQueryData(storeKey(storeId, "product-markets", productId), data),
  });
}
