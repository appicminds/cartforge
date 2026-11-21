"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CustomerDetail,
  CustomerListItem,
  DetailResponse,
  ListResponse,
} from "@cartforge/types";
import { apiRequest } from "./api-client";
import { storeKey, useSession } from "./session";

const useStoreId = () => useSession().store?.store_id;

export interface CustomerListParams {
  q?: string;
  sort: "created_at" | "last_order_at" | "total_spent";
  page: number;
  page_size: number;
}

export function useCustomerList(params: CustomerListParams) {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "customers", "list", params),
    enabled: Boolean(storeId),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiRequest<ListResponse<CustomerListItem>>("/customers", {
        storeId,
        signal,
        query: { ...params },
      }),
  });
}

export function useCustomer(id: string) {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "customers", "detail", id),
    enabled: Boolean(storeId),
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<CustomerDetail>>(`/customers/${id}`, { storeId, signal }).then(
        (r) => r.data,
      ),
  });
}

export function useUpdateCustomer(id: string) {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { note?: string | null; tags?: string[]; accepts_marketing?: boolean }) =>
      apiRequest<DetailResponse<CustomerDetail>>(`/customers/${id}`, {
        method: "PATCH",
        body,
        storeId,
      }).then((r) => r.data),
    onSuccess: (c) => {
      qc.setQueryData(storeKey(storeId, "customers", "detail", id), c);
      void qc.invalidateQueries({ queryKey: storeKey(storeId, "customers", "list") });
    },
  });
}
