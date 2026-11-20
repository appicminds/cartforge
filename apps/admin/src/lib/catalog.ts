"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BulkResult,
  CategorySummary,
  CollectionDetail,
  CollectionSummary,
  DetailResponse,
  ListResponse,
  ProductDetail,
} from "@cartforge/types";
import type {
  CategoryCreateInput as CategoryCreate,
  CategoryUpdateInput as CategoryUpdate,
  CollectionCreateInput as CollectionCreate,
  CollectionUpdateInput as CollectionUpdate,
  ProductBulkInput as ProductBulk,
} from "@cartforge/validation";
import { apiRequest } from "./api-client";
import { storeKey, useSession } from "./session";

const useStoreId = () => useSession().store?.store_id;

function useInvalidate() {
  const qc = useQueryClient();
  const storeId = useStoreId();
  return (...parts: string[][]) =>
    parts.forEach((p) => void qc.invalidateQueries({ queryKey: storeKey(storeId, ...p) }));
}

// ───────────── Categories ─────────────

export function useCategories() {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "categories"),
    enabled: Boolean(storeId),
    queryFn: ({ signal }) =>
      apiRequest<{ data: CategorySummary[] }>("/categories", { storeId, signal }).then(
        (r) => r.data,
      ),
  });
}

export function useSaveCategory() {
  const storeId = useStoreId();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CategoryCreate | CategoryUpdate }) =>
      apiRequest<DetailResponse<CategorySummary>>(id ? `/categories/${id}` : "/categories", {
        method: id ? "PATCH" : "POST",
        body,
        storeId,
      }).then((r) => r.data),
    onSuccess: () => invalidate(["categories"], ["products"]),
  });
}

export function useReorderCategories() {
  const storeId = useStoreId();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { parent_id: string | null; ids: string[] }) =>
      apiRequest("/categories/reorder", { method: "POST", body, storeId }),
    onSuccess: () => invalidate(["categories"]),
  });
}

export function useDeleteCategory() {
  const storeId = useStoreId();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      reassign_to,
      unassign,
    }: {
      id: string;
      reassign_to?: string;
      unassign?: boolean;
    }) =>
      apiRequest(`/categories/${id}/delete`, {
        method: "POST",
        body: { reassign_to, unassign },
        storeId,
      }),
    onSuccess: () => invalidate(["categories"], ["products"]),
  });
}

// ───────────── Collections ─────────────

export function useCollections(params: { q?: string; page?: number; page_size?: number } = {}) {
  const storeId = useStoreId();
  const query = { page: 1, page_size: 100, ...params };
  return useQuery({
    queryKey: storeKey(storeId, "collections", "list", query),
    enabled: Boolean(storeId),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiRequest<ListResponse<CollectionSummary>>("/collections", { storeId, signal, query }),
  });
}

export function useCollection(id: string) {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "collections", "detail", id),
    enabled: Boolean(storeId),
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<CollectionDetail>>(`/collections/${id}`, { storeId, signal }).then(
        (r) => r.data,
      ),
  });
}

export function useSaveCollection() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CollectionCreate | CollectionUpdate }) =>
      apiRequest<DetailResponse<CollectionDetail>>(id ? `/collections/${id}` : "/collections", {
        method: id ? "PATCH" : "POST",
        body,
        storeId,
      }).then((r) => r.data),
    onSuccess: (c) => {
      qc.setQueryData(storeKey(storeId, "collections", "detail", c.id), c);
      void qc.invalidateQueries({ queryKey: storeKey(storeId, "collections", "list") });
    },
  });
}

export function useSetCollectionProducts(id: string) {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (product_ids: string[]) =>
      apiRequest<DetailResponse<CollectionDetail>>(`/collections/${id}/products`, {
        method: "PUT",
        body: { product_ids },
        storeId,
      }).then((r) => r.data),
    onSuccess: (c) => {
      qc.setQueryData(storeKey(storeId, "collections", "detail", c.id), c);
      void qc.invalidateQueries({ queryKey: storeKey(storeId, "collections", "list") });
      void qc.invalidateQueries({ queryKey: storeKey(storeId, "products") });
    },
  });
}

export function useDeleteCollection() {
  const storeId = useStoreId();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/collections/${id}`, { method: "DELETE", storeId }),
    onSuccess: () => invalidate(["collections"], ["products"]),
  });
}

// ───────────── Products: bulk + duplicate ─────────────

export function useBulkProducts() {
  const storeId = useStoreId();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ProductBulk) =>
      apiRequest<DetailResponse<BulkResult>>("/products/bulk", {
        method: "POST",
        body,
        storeId,
      }).then((r) => r.data),
    onSettled: () => invalidate(["products"], ["inventory"], ["collections"], ["categories"]),
  });
}

export function useDuplicateProduct() {
  const storeId = useStoreId();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      title,
      include_media,
    }: {
      id: string;
      title?: string;
      include_media: boolean;
    }) =>
      apiRequest<DetailResponse<ProductDetail>>(`/products/${id}/duplicate`, {
        method: "POST",
        body: { ...(title && { title }), include_media },
        storeId,
      }).then((r) => r.data),
    onSuccess: () => invalidate(["products"], ["inventory"]),
  });
}

export const COLLECTION_SORT_LABEL: Record<string, string> = {
  manual: "Manually",
  title_asc: "Title A–Z",
  title_desc: "Title Z–A",
  price_asc: "Price, low to high",
  price_desc: "Price, high to low",
  created_desc: "Newest first",
  created_asc: "Oldest first",
};
