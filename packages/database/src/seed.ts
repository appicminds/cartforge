/**
 * Development/test seed (S0-17). Idempotent: safe to run repeatedly.
 *
 * - Local/test: uses the shared dev password below.
 * - Hosted demo (e.g. Vercel): requires CARTFORGE_DEMO_SEED=true AND a private
 *   SEED_PASSWORD (≥ 12 chars). The public dev password is never used there.
 * - Otherwise refuses to run when NODE_ENV=production.
 */
import argon2 from "argon2";
import { SYSTEM_ROLES, type SystemRoleKey } from "@cartforge/types";
import { createPrismaClient } from "./client.js";

export const SEED_PASSWORD = "CartForge!dev1";

export const SEED_STORES = {
  main: { id: "00000000-0000-4000-8000-000000000001", name: "Northwind Goods", currency: "USD" },
  second: {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Harbor Outfitters",
    currency: "EUR",
  },
  /** Kept free of catalog data so first-use empty states can be tested. Never add products here in tests. */
  empty: { id: "00000000-0000-4000-8000-000000000003", name: "Quiet Pines", currency: "USD" },
} as const;

export const SEED_USERS = [
  {
    email: "owner@cartforge.test",
    name: "Olivia Owner",
    memberships: [
      ["main", "owner"],
      ["second", "owner"],
      ["empty", "owner"],
    ],
  },
  { email: "admin@cartforge.test", name: "Adam Admin", memberships: [["main", "admin"]] },
  {
    email: "catalog@cartforge.test",
    name: "Cara Catalog",
    memberships: [["main", "catalog_manager"]],
  },
  { email: "orders@cartforge.test", name: "Omar Orders", memberships: [["main", "order_manager"]] },
  { email: "other@cartforge.test", name: "Sam Second", memberships: [["second", "owner"]] },
] as const satisfies ReadonlyArray<{
  email: string;
  name: string;
  memberships: ReadonlyArray<readonly [keyof typeof SEED_STORES, SystemRoleKey]>;
}>;

export function resolveSeedPassword(env: NodeJS.ProcessEnv): string {
  const demo = env.CARTFORGE_DEMO_SEED === "true";
  if (demo) {
    const pw = env.SEED_PASSWORD ?? "";
    if (pw.length < 12) {
      throw new Error(
        "CARTFORGE_DEMO_SEED=true requires SEED_PASSWORD with at least 12 characters",
      );
    }
    return pw;
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to run development seed with NODE_ENV=production (set CARTFORGE_DEMO_SEED for a demo)",
    );
  }
  return SEED_PASSWORD;
}

export async function seed(databaseUrl?: string): Promise<void> {
  const password = resolveSeedPassword(process.env);
  const prisma = createPrismaClient(databaseUrl);
  try {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    for (const store of Object.values(SEED_STORES)) {
      await prisma.store.upsert({
        where: { id: store.id },
        update: { name: store.name, currency: store.currency },
        create: { ...store, contact_email: "hello@cartforge.test" },
      });
      for (const [key, role] of Object.entries(SYSTEM_ROLES)) {
        await prisma.role.upsert({
          where: { store_id_key: { store_id: store.id, key } },
          update: { name: role.name, permissions: [...role.permissions], is_system: true },
          create: {
            store_id: store.id,
            key,
            name: role.name,
            permissions: [...role.permissions],
            is_system: true,
          },
        });
      }
    }

    for (const u of SEED_USERS) {
      const user = await prisma.user.upsert({
        where: { email: u.email },
        update: { name: u.name, password_hash: passwordHash, status: "active" },
        create: { email: u.email, name: u.name, password_hash: passwordHash },
      });
      for (const [storeKey, roleKey] of u.memberships) {
        const storeId = SEED_STORES[storeKey].id;
        const role = await prisma.role.findUniqueOrThrow({
          where: { store_id_key: { store_id: storeId, key: roleKey } },
        });
        await prisma.storeMembership.upsert({
          where: { store_id_user_id: { store_id: storeId, user_id: user.id } },
          update: { role_id: role.id, status: "active" },
          create: { store_id: storeId, user_id: user.id, role_id: role.id },
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seed()
    .then(() =>
      console.warn(
        process.env.CARTFORGE_DEMO_SEED === "true"
          ? "Demo seed complete. Seeded users use the SEED_PASSWORD you configured."
          : `Seed complete. Dev password for all seeded users: ${SEED_PASSWORD}`,
      ),
    )
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
