"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DetailResponse,
  ListResponse,
  ProductDetail,
  ProductListItem,
} from "@cartforge/types";
import type { ProductCreateInput, ProductUpdateInput } from "@cartforge/validation";
import { apiRequest } from "./api-client";
import { storeKey, useSession } from "./session";

export interface ProductListParams {
  q?: string;
  status?: string;
  product_type?: string;
  category_id?: string;
  collection_id?: string;
  sort: "title" | "created_at" | "updated_at" | "status";
  order: "asc" | "desc";
  page: number;
  page_size: number;
}

function useStoreId(): string | undefined {
  return useSession().store?.store_id;
}

export function useProductList(params: ProductListParams) {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "products", "list", params),
    enabled: Boolean(storeId),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiRequest<ListResponse<ProductListItem>>("/products", {
        storeId,
        signal,
        query: { ...params },
      }),
  });
}

export function useProduct(id: string) {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "products", "detail", id),
    enabled: Boolean(storeId),
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<ProductDetail>>(`/products/${id}`, { storeId, signal }).then(
        (r) => r.data,
      ),
  });
}

/** After any write: refresh lists, seed the detail cache with the server's response. */
function useProductCacheSync() {
  const qc = useQueryClient();
  const storeId = useStoreId();
  return (product?: ProductDetail) => {
    if (product) qc.setQueryData(storeKey(storeId, "products", "detail", product.id), product);
    void qc.invalidateQueries({ queryKey: storeKey(storeId, "products", "list") });
  };
}

export function useCreateProduct() {
  const storeId = useStoreId();
  const sync = useProductCacheSync();
  return useMutation({
    mutationFn: (body: ProductCreateInput) =>
      apiRequest<DetailResponse<ProductDetail>>("/products", {
        method: "POST",
        body,
        storeId,
      }).then((r) => r.data),
    onSuccess: (p) => sync(p),
  });
}

export function useUpdateProduct(id: string) {
  const storeId = useStoreId();
  const sync = useProductCacheSync();
  return useMutation({
    mutationFn: (body: ProductUpdateInput) =>
      apiRequest<DetailResponse<ProductDetail>>(`/products/${id}`, {
        method: "PATCH",
        body,
        storeId,
      }).then((r) => r.data),
    onSuccess: (p) => sync(p),
  });
}

export function useDeleteProduct() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/products/${id}`, { method: "DELETE", storeId }),
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: storeKey(storeId, "products", "detail", id) });
      void qc.invalidateQueries({ queryKey: storeKey(storeId, "products", "list") });
    },
  });
}

export const STATUS_LABEL: Record<ProductDetail["status"], string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};

export const STATUS_TONE = { draft: "neutral", active: "success", archived: "warning" } as const;

/** Remembers the list URL (search, filters, page) so returning from a product keeps it (PRD §8.3). */
export const LIST_URL_KEY = "cf:products-list-url";
export function rememberListUrl(url: string) {
  try {
    sessionStorage.setItem(LIST_URL_KEY, url);
  } catch {
    /* storage unavailable */
  }
}
export function lastListUrl(): string {
  try {
    return sessionStorage.getItem(LIST_URL_KEY) ?? "/admin/products";
  } catch {
    return "/admin/products";
  }
}
