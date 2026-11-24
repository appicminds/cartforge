import { Prisma } from "@cartforge/database";
import type { CatalogImage } from "@cartforge/types";
import { mediaUrls } from "../media/media.mapper";
import { MEDIA_RESOURCE } from "../media/media.service";

/**
 * Category and collection images. A merchant can choose one; when none is chosen,
 * the main photo of a product inside is used, so a tile never shows up empty.
 */

type Db = Prisma.TransactionClient;
type ImageOwner = typeof MEDIA_RESOURCE.CATEGORY | typeof MEDIA_RESOURCE.COLLECTION;

/** Keeps media_references in step with the chosen image, so the image can't be deleted. */
export async function syncCoverReference(
  tx: Db,
  storeId: string,
  owner: ImageOwner,
  ownerId: string,
  assetId: string | null,
): Promise<void> {
  await tx.mediaReference.deleteMany({
    where: { store_id: storeId, resource_type: owner, resource_id: ownerId },
  });
  if (assetId) {
    await tx.mediaReference.create({
      data: {
        store_id: storeId,
        media_asset_id: assetId,
        resource_type: owner,
        resource_id: ownerId,
      },
    });
  }
}

/** Images by asset id (deleted assets are left out). */
export async function loadCatalogImages(
  db: Db,
  storeId: string,
  ids: (string | null | undefined)[],
): Promise<Map<string, CatalogImage>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (!wanted.length) return new Map();
  const assets = await db.mediaAsset.findMany({
    where: { store_id: storeId, id: { in: wanted }, deleted_at: null },
    include: { derivatives: true },
  });
  return new Map(
    assets.map((a) => [
      a.id,
      {
        media_asset_id: a.id,
        ...mediaUrls(a),
        alt: a.alt_text,
        width: a.width,
        height: a.height,
      },
    ]),
  );
}

/**
 * For each category: the main photo of its newest active product, looking into
 * subcategories too. `activeOnly` skips archived subcategories (as the storefront does).
 */
export async function categoryFallbackImages(
  db: Db,
  storeId: string,
  activeOnly: boolean,
): Promise<Map<string, string>> {
  const active = activeOnly ? Prisma.sql`AND c.status = 'active'` : Prisma.empty;
  const rows = await db.$queryRaw<{ owner: string; asset: string }[]>`
    WITH RECURSIVE tree AS (
      SELECT c.id AS root, c.id FROM categories c WHERE c.store_id = ${storeId}::uuid ${active}
      UNION ALL
      SELECT t.root, c.id FROM categories c JOIN tree t ON c.parent_id = t.id WHERE TRUE ${active}
    )
    SELECT DISTINCT ON (t.root) t.root AS owner, pm.media_asset_id AS asset
    FROM tree t
    JOIN product_categories pc ON pc.category_id = t.id
    JOIN products p ON p.id = pc.product_id AND p.status = 'active' AND p.deleted_at IS NULL
    JOIN product_media pm ON pm.product_id = p.id
    JOIN media_assets a ON a.id = pm.media_asset_id AND a.deleted_at IS NULL
    ORDER BY t.root, p.published_at DESC NULLS LAST, p.id,
      (a.mime_type LIKE 'image/%') DESC, pm.is_primary DESC, pm.position ASC`;
  return new Map(rows.map((r) => [r.owner, r.asset]));
}

/** For each collection: the main photo of its first active product (in collection order). */
export async function collectionFallbackImages(
  db: Db,
  storeId: string,
  collectionIds: string[],
): Promise<Map<string, string>> {
  if (!collectionIds.length) return new Map();
  const rows = await db.$queryRaw<{ owner: string; asset: string }[]>`
    SELECT DISTINCT ON (cp.collection_id) cp.collection_id AS owner, pm.media_asset_id AS asset
    FROM collection_products cp
    JOIN products p ON p.id = cp.product_id AND p.status = 'active' AND p.deleted_at IS NULL
    JOIN product_media pm ON pm.product_id = p.id
    JOIN media_assets a ON a.id = pm.media_asset_id AND a.deleted_at IS NULL
    WHERE cp.store_id = ${storeId}::uuid AND cp.collection_id = ANY(${collectionIds}::uuid[])
    ORDER BY cp.collection_id, cp.position ASC, p.title ASC,
      (a.mime_type LIKE 'image/%') DESC, pm.is_primary DESC, pm.position ASC`;
  return new Map(rows.map((r) => [r.owner, r.asset]));
}
