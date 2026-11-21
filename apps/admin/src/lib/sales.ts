"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DetailResponse,
  ProductSaleInfo,
  SaleDetail,
  SaleEndResult,
  SalePreview,
  SaleView,
} from "@cartforge/types";
import type { SaleInput } from "@cartforge/validation";
import { apiRequest } from "./api-client";
import { storeKey, useSession } from "./session";

const useStoreId = () => useSession().store?.store_id;

export function useSales() {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "sales"),
    enabled: Boolean(storeId),
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<SaleView[]>>("/sales", { storeId, signal }).then((r) => r.data),
  });
}

export function useSale(id: string | undefined) {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "sales", id),
    enabled: Boolean(storeId && id),
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<SaleDetail>>(`/sales/${id}`, { storeId, signal }).then(
        (r) => r.data,
      ),
  });
}

export function useProductSale(productId: string | undefined) {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "sales", "product", productId),
    enabled: Boolean(storeId && productId),
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<ProductSaleInfo | null>>(`/sales/product/${productId}`, {
        storeId,
        signal,
      }).then((r) => r.data),
  });
}

export function useSalePreview() {
  const storeId = useStoreId();
  return useMutation({
    mutationFn: (body: SaleInput) =>
      apiRequest<DetailResponse<SalePreview>>("/sales/preview", {
        method: "POST",
        body,
        storeId,
      }).then((r) => r.data),
  });
}

type SaleAction =
  | { kind: "create"; body: SaleInput }
  | { kind: "update"; id: string; body: Partial<SaleInput> }
  | { kind: "end"; id: string }
  | { kind: "remove-products"; id: string; product_ids: string[] }
  | { kind: "apply-new"; id: string }
  | { kind: "delete"; id: string };

export function useSaleAction() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: SaleAction): Promise<unknown> => {
      switch (a.kind) {
        case "create":
          return (
            await apiRequest<DetailResponse<SaleView>>("/sales", {
              method: "POST",
              body: a.body,
              storeId,
            })
          ).data;
        case "update":
          return (
            await apiRequest<DetailResponse<SaleDetail>>(`/sales/${a.id}`, {
              method: "PATCH",
              body: a.body,
              storeId,
            })
          ).data;
        case "end":
          return (
            await apiRequest<DetailResponse<SaleEndResult>>(`/sales/${a.id}/end`, {
              method: "POST",
              storeId,
            })
          ).data;
        case "remove-products":
          return (
            await apiRequest<DetailResponse<SaleEndResult>>(`/sales/${a.id}/remove-products`, {
              method: "POST",
              body: { product_ids: a.product_ids },
              storeId,
            })
          ).data;
        case "apply-new":
          return (
            await apiRequest<DetailResponse<{ added: number }>>(`/sales/${a.id}/apply-new`, {
              method: "POST",
              storeId,
            })
          ).data;
        case "delete":
          return apiRequest(`/sales/${a.id}`, { method: "DELETE", storeId });
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: storeKey(storeId, "sales") });
      void qc.invalidateQueries({ queryKey: storeKey(storeId, "products") });
    },
  });
}
