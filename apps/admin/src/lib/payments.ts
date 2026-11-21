"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DetailResponse, PaymentAccountView, ProviderInfo } from "@cartforge/types";
import type { PaymentAccountInput } from "@cartforge/validation";
import { apiRequest } from "./api-client";
import { storeKey, useSession } from "./session";

const useStoreId = () => useSession().store?.store_id;

export function usePaymentProviders() {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "payments"),
    enabled: Boolean(storeId),
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<{ providers: ProviderInfo[]; accounts: PaymentAccountView[] }>>(
        "/payments/providers",
        { storeId, signal },
      ).then((r) => r.data),
  });
}

export function usePaymentAccountAction() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      a:
        | { kind: "save"; provider: string; body: PaymentAccountInput }
        | { kind: "remove"; provider: string },
    ) =>
      a.kind === "save"
        ? apiRequest(`/payments/accounts/${a.provider}`, { method: "PUT", body: a.body, storeId })
        : apiRequest(`/payments/accounts/${a.provider}`, { method: "DELETE", storeId }),
    onSettled: () => void qc.invalidateQueries({ queryKey: storeKey(storeId, "payments") }),
  });
}
