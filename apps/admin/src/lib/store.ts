"use client";

import { useQuery } from "@tanstack/react-query";
import type { DetailResponse, StoreSummary } from "@cartforge/types";
import { apiRequest } from "./api-client";
import { storeKey, useSession } from "./session";

export function useStoreSettings() {
  const storeId = useSession().store?.store_id;
  return useQuery({
    queryKey: storeKey(storeId, "settings"),
    enabled: Boolean(storeId),
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<StoreSummary>>("/store", { storeId, signal }).then((r) => r.data),
  });
}
