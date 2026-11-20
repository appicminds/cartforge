"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DetailResponse,
  ListResponse,
  OrderDetail,
  OrderListItem,
  OrderStatus,
  PaymentStatus,
  ShippingMethodView,
} from "@cartforge/types";
import type {
  CheckoutSettings,
  CheckoutSettingsInput,
  ShippingMethodInput,
} from "@cartforge/validation";
import { apiRequest } from "./api-client";
import { storeKey, useSession } from "./session";

const useStoreId = () => useSession().store?.store_id;

export interface OrderListParams {
  q?: string;
  payment_status?: PaymentStatus;
  page: number;
  page_size: number;
}

export function useOrderList(params: OrderListParams) {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "orders", "list", params),
    enabled: Boolean(storeId),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiRequest<ListResponse<OrderListItem>>("/orders", { storeId, signal, query: { ...params } }),
  });
}

export function useOrder(id: string) {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "orders", "detail", id),
    enabled: Boolean(storeId),
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<OrderDetail>>(`/orders/${id}`, { storeId, signal }).then(
        (r) => r.data,
      ),
  });
}

export function useCheckoutSettings() {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "checkout-settings"),
    enabled: Boolean(storeId),
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<CheckoutSettings>>("/settings/checkout", { storeId, signal }).then(
        (r) => r.data,
      ),
  });
}

export function useSaveCheckoutSettings() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CheckoutSettingsInput) =>
      apiRequest<DetailResponse<CheckoutSettings>>("/settings/checkout", {
        method: "PUT",
        body,
        storeId,
      }).then((r) => r.data),
    onSuccess: (data) => qc.setQueryData(storeKey(storeId, "checkout-settings"), data),
  });
}

export function useShippingMethods() {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "shipping-methods"),
    enabled: Boolean(storeId),
    queryFn: ({ signal }) =>
      apiRequest<{ data: ShippingMethodView[] }>("/shipping-methods", { storeId, signal }).then(
        (r) => r.data,
      ),
  });
}

export function useSaveShippingMethod() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: ShippingMethodInput }) =>
      apiRequest<DetailResponse<ShippingMethodView>>(
        id ? `/shipping-methods/${id}` : "/shipping-methods",
        {
          method: id ? "PATCH" : "POST",
          body,
          storeId,
        },
      ).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: storeKey(storeId, "shipping-methods") }),
  });
}

export function useDeleteShippingMethod() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/shipping-methods/${id}`, { method: "DELETE", storeId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: storeKey(storeId, "shipping-methods") }),
  });
}

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: "Payment pending",
  authorized: "Authorized",
  paid: "Paid",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
  voided: "Voided",
  failed: "Failed",
};
export const PAYMENT_TONE: Record<
  PaymentStatus,
  "neutral" | "success" | "warning" | "danger" | "info"
> = {
  pending: "warning",
  authorized: "info",
  paid: "success",
  partially_refunded: "neutral",
  refunded: "neutral",
  voided: "neutral",
  failed: "danger",
};
export const ORDER_LABEL: Record<OrderStatus, string> = {
  pending: "Open",
  processing: "Processing",
  on_hold: "On hold",
  completed: "Completed",
  canceled: "Canceled",
  refunded: "Refunded",
};
export const FULFILLMENT_LABEL = {
  unfulfilled: "Unfulfilled",
  partially_fulfilled: "Partially fulfilled",
  fulfilled: "Fulfilled",
} as const;
