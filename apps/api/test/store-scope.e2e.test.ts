import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED_STORES } from "@cartforge/database/seed";
import { createTestApp, login, type Session } from "./app";

const MAIN = SEED_STORES.main.id;
const SECOND = SEED_STORES.second.id;

describe("store scope + permissions (Sprint 0 exit gate)", () => {
  let app: INestApplication;
  let owner: Session;
  let catalog: Session;
  let other: Session;

  beforeAll(async () => {
    app = await createTestApp();
    owner = await login(app, "owner@cartforge.test");
    catalog = await login(app, "catalog@cartforge.test");
    other = await login(app, "other@cartforge.test");
  });
  afterAll(async () => {
    await app.close();
  });

  const getStore = (s: Session | null, storeId?: string) => {
    let r = request(app.getHttpServer()).get("/api/v1/store");
    if (s) r = r.set("Cookie", s.cookies);
    if (storeId) r = r.set("X-Store-Id", storeId);
    return r;
  };

  it("returns the scoped store for a member", async () => {
    const res = await getStore(catalog, MAIN).expect(200);
    expect(res.body.data).toMatchObject({ id: MAIN, name: "Northwind Goods", currency: "USD" });
  });

  it("lets a multi-store owner switch scope", async () => {
    const res = await getStore(owner, SECOND).expect(200);
    expect(res.body.data.id).toBe(SECOND);
  });

  it("denies access to a store the user is not a member of", async () => {
    const res = await getStore(other, MAIN).expect(403);
    expect(res.body.error.code).toBe("STORE_ACCESS_DENIED");
  });

  it("does not reveal whether a store id exists", async () => {
    const res = await getStore(other, "11111111-1111-4111-8111-111111111111").expect(403);
    expect(res.body.error.code).toBe("STORE_ACCESS_DENIED");
  });

  it("requires a well-formed X-Store-Id", async () => {
    expect((await getStore(owner).expect(400)).body.error.code).toBe("STORE_SCOPE_REQUIRED");
    expect((await getStore(owner, "not-a-uuid").expect(400)).body.error.code).toBe(
      "STORE_SCOPE_REQUIRED",
    );
  });

  it("requires authentication before scope", async () => {
    expect((await getStore(null, MAIN).expect(401)).body.error.code).toBe("UNAUTHENTICATED");
  });
});
