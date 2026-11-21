"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DetailResponse, DiscountView } from "@cartforge/types";
import type { DiscountInput } from "@cartforge/validation";
import { apiRequest } from "./api-client";
import { storeKey, useSession } from "./session";

const useStoreId = () => useSession().store?.store_id;

export function useDiscounts(params: { q?: string; status?: string } = {}) {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "discounts", params),
    enabled: Boolean(storeId),
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<DiscountView[]>>("/discounts", {
        storeId,
        signal,
        query: Object.fromEntries(Object.entries(params).filter(([, v]) => v)),
      }).then((r) => r.data),
  });
}

export function useDiscount(id: string | undefined) {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "discount", id),
    enabled: Boolean(storeId && id),
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<DiscountView>>(`/discounts/${id}`, { storeId, signal }).then(
        (r) => r.data,
      ),
  });
}

export function useDiscountAction() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      a: { kind: "save"; id?: string; body: DiscountInput } | { kind: "remove"; id: string },
    ) =>
      a.kind === "remove"
        ? apiRequest(`/discounts/${a.id}`, { method: "DELETE", storeId })
        : apiRequest<DetailResponse<DiscountView>>(a.id ? `/discounts/${a.id}` : "/discounts", {
            method: a.id ? "PUT" : "POST",
            body: a.body,
            storeId,
          }).then((r) => r.data),
    onSettled: () => void qc.invalidateQueries({ queryKey: storeKey(storeId, "discounts") }),
  });
}
