"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DetailResponse,
  InventoryRow,
  ListResponse,
  ProductDetail,
  StockMovementSummary,
  StockState,
  VariantPlan,
} from "@cartforge/types";
import type {
  InventoryAdjust,
  ProductOptionsInput,
  VariantBulkUpdate,
  VariantUpdate,
} from "@cartforge/validation";
import { apiRequest } from "./api-client";
import { storeKey, useSession } from "./session";

export interface InventoryListParams {
  q?: string;
  stock: "all" | "low" | "out";
  page: number;
  page_size: number;
}

const useStoreId = () => useSession().store?.store_id;

export function useInventoryList(params: InventoryListParams) {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "inventory", "list", params),
    enabled: Boolean(storeId),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiRequest<ListResponse<InventoryRow>>("/inventory", {
        storeId,
        signal,
        query: { ...params },
      }),
  });
}

export function useMovements(variantId: string | null) {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "inventory", "movements", variantId),
    enabled: Boolean(storeId && variantId),
    queryFn: ({ signal }) =>
      apiRequest<ListResponse<StockMovementSummary>>("/inventory/movements", {
        storeId,
        signal,
        query: { variant_id: variantId!, page_size: 50 },
      }),
  });
}

/** After stock/variant changes, refresh everything that shows stock or variants. */
function useRefresh() {
  const qc = useQueryClient();
  const storeId = useStoreId();
  return (product?: ProductDetail) => {
    if (product) qc.setQueryData(storeKey(storeId, "products", "detail", product.id), product);
    void qc.invalidateQueries({ queryKey: storeKey(storeId, "inventory") });
    void qc.invalidateQueries({ queryKey: storeKey(storeId, "products", "list") });
    if (!product) void qc.invalidateQueries({ queryKey: storeKey(storeId, "products", "detail") });
  };
}

export function useAdjustStock() {
  const storeId = useStoreId();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: InventoryAdjust) =>
      apiRequest<DetailResponse<InventoryRow>>("/inventory/adjustments", {
        method: "POST",
        body,
        storeId,
      }).then((r) => r.data),
    onSuccess: () => refresh(),
  });
}

export function usePreviewOptions(productId: string) {
  const storeId = useStoreId();
  return useMutation({
    mutationFn: (options: ProductOptionsInput) =>
      apiRequest<DetailResponse<VariantPlan>>(`/products/${productId}/options/preview`, {
        method: "POST",
        body: { options },
        storeId,
      }).then((r) => r.data),
  });
}

export function useApplyOptions(productId: string) {
  const storeId = useStoreId();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: { options: ProductOptionsInput; confirm_removals?: boolean }) =>
      apiRequest<DetailResponse<ProductDetail>>(`/products/${productId}/options`, {
        method: "PUT",
        body,
        storeId,
      }).then((r) => r.data),
    onSuccess: (p) => refresh(p),
  });
}

export function useUpdateVariant() {
  const storeId = useStoreId();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: VariantUpdate }) =>
      apiRequest<DetailResponse<ProductDetail>>(`/variants/${id}`, {
        method: "PATCH",
        body,
        storeId,
      }).then((r) => r.data),
    onSuccess: (p) => refresh(p),
  });
}

export function useBulkUpdateVariants(productId: string) {
  const storeId = useStoreId();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: VariantBulkUpdate) =>
      apiRequest<DetailResponse<ProductDetail>>(`/products/${productId}/variants`, {
        method: "PATCH",
        body,
        storeId,
      }).then((r) => r.data),
    onSuccess: (p) => refresh(p),
  });
}

export const STOCK_LABEL: Record<StockState, string> = {
  in_stock: "In stock",
  low: "Low stock",
  out: "Out of stock",
  untracked: "Not tracked",
};
export const STOCK_TONE = {
  in_stock: "success",
  low: "warning",
  out: "danger",
  untracked: "neutral",
} as const;

export const REASON_LABEL: Record<string, string> = {
  initial: "Initial stock",
  received: "Received",
  correction: "Correction (count)",
  damaged: "Damaged",
  shrinkage: "Shrinkage / theft",
  returned: "Returned",
  other: "Other",
};
