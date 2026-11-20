import type { Prisma } from "@cartforge/database";

/**
 * Records a permanent redirect when a public handle changes (PRD §8.4 A).
 * Keeps chains flat (A→B then B→C becomes A→C, B→C) and drops a redirect when
 * an old path is reused as the new target (reverting a rename).
 */
export async function recordRedirect(
  tx: Pick<Prisma.TransactionClient, "urlRedirect">,
  r: { store_id: string; from: string; to: string; resource_type: string; resource_id: string },
): Promise<void> {
  if (r.from === r.to) return;
  await tx.urlRedirect.deleteMany({ where: { store_id: r.store_id, path_from: r.to } });
  await tx.urlRedirect.updateMany({
    where: { store_id: r.store_id, path_to: r.from },
    data: { path_to: r.to },
  });
  await tx.urlRedirect.upsert({
    where: { store_id_path_from: { store_id: r.store_id, path_from: r.from } },
    update: { path_to: r.to, resource_type: r.resource_type, resource_id: r.resource_id },
    create: {
      store_id: r.store_id,
      path_from: r.from,
      path_to: r.to,
      resource_type: r.resource_type,
      resource_id: r.resource_id,
    },
  });
}
