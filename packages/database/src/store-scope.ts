/**
 * Store-isolation helper (BE-012). Every query against a store-owned table must
 * go through this so the store_id filter cannot be forgotten or overridden by
 * caller-supplied input.
 */
export function storeScoped<W extends object>(
  storeId: string,
  where?: W,
): W & { store_id: string } {
  if (!storeId) throw new Error("storeScoped: storeId is required");
  // store_id is spread last so a caller-provided store_id can never widen scope.
  return { ...(where ?? ({} as W)), store_id: storeId };
}
