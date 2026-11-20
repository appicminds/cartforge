"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreatedInvitation, DetailResponse, TeamView } from "@cartforge/types";
import { apiRequest } from "./api-client";
import { storeKey, useSession } from "./session";

const useStoreId = () => useSession().store?.store_id;

export function useTeam() {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, "team"),
    enabled: Boolean(storeId),
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<TeamView>>("/staff", { storeId, signal }).then((r) => r.data),
  });
}

export function useInvite() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; role_id: string }) =>
      apiRequest<DetailResponse<CreatedInvitation>>("/staff/invitations", {
        method: "POST",
        body,
        storeId,
      }).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: storeKey(storeId, "team") }),
  });
}

export function useTeamAction() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      a:
        | { kind: "role"; membershipId: string; roleId: string }
        | { kind: "remove"; membershipId: string }
        | { kind: "revoke"; invitationId: string },
    ) => {
      if (a.kind === "role")
        return apiRequest(`/staff/members/${a.membershipId}`, {
          method: "PATCH",
          body: { role_id: a.roleId },
          storeId,
        });
      if (a.kind === "remove")
        return apiRequest(`/staff/members/${a.membershipId}`, { method: "DELETE", storeId });
      return apiRequest(`/staff/invitations/${a.invitationId}`, { method: "DELETE", storeId });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: storeKey(storeId, "team") }),
  });
}
