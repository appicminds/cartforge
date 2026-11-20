import type { INestApplication } from "@nestjs/common";
import argon2 from "argon2";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@cartforge/database";
import { SEED_PASSWORD, SEED_STORES } from "@cartforge/database/seed";
import { Mailer, type Email } from "../src/mail/mailer";
import { api, createTestApp, login, RUN, type Session } from "./app";
import { TEST_ENV } from "./test-env";

const MAIN = SEED_STORES.main.id;

/** Next 1: team management and invitations. */
describe("staff: team and invitations", () => {
  let app: INestApplication;
  const prisma = createPrismaClient(TEST_ENV.DATABASE_URL);
  const sent: Email[] = [];
  const http = () => request(app.getHttpServer());
  const mail = (tag: string) => `${tag}-${RUN}@example.com`.toLowerCase();
  let admin: ReturnType<typeof api>;
  let roles: Record<string, string>;
  const tokenOf = (url: string) => new URL(url).searchParams.get("token")!;

  const sessionFrom = (res: request.Response): Session => {
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    return {
      cookies: cookies.map((c) => c.split(";")[0]!),
      csrf: cookies
        .find((c) => c.startsWith("cf_csrf="))!
        .split(";")[0]!
        .split("=")[1]!,
    };
  };

  beforeAll(async () => {
    app = await createTestApp([
      {
        provide: Mailer,
        useValue: { enabled: true, send: async (e: Email) => (sent.push(e), true) },
      },
    ]);
    admin = api(app, await login(app, "admin@cartforge.test"), MAIN);
    const team = (await admin.get("/staff").expect(200)).body.data;
    roles = Object.fromEntries(team.roles.map((r: { key: string; id: string }) => [r.key, r.id]));
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("shows the team only to people who may see it", async () => {
    const catalog = api(app, await login(app, "catalog@cartforge.test"), MAIN);
    await catalog.get("/staff").expect(403);
    await catalog
      .post("/staff/invitations", { email: mail("x"), role_id: roles.catalog_manager })
      .expect(403);

    const team = (await admin.get("/staff").expect(200)).body.data;
    const owner = team.members.find((m: { is_owner: boolean }) => m.is_owner);
    expect(owner).toMatchObject({ email: "owner@cartforge.test", manageable: false });
    expect(team.members.find((m: { is_you: boolean }) => m.is_you)).toMatchObject({
      email: "admin@cartforge.test",
      manageable: false,
    });
    expect(team.roles.map((r: { key: string }) => r.key)).not.toContain("owner");
    expect(team.roles.every((r: { assignable: boolean }) => r.assignable)).toBe(true);
  });

  it("invites a new person, who joins by creating an account", async () => {
    sent.length = 0;
    const email = mail("newbie");
    const res = await admin
      .post("/staff/invitations", { email: email.toUpperCase(), role_id: roles.catalog_manager })
      .expect(201);
    expect(res.body.data).toMatchObject({ email, role: { key: "catalog_manager" }, emailed: true });
    expect(sent[0]!.to).toBe(email);
    expect(sent[0]!.text).toContain(res.body.data.url);
    const token = tokenOf(res.body.data.url);

    const preview = (await http().post("/api/v1/invitations/preview").send({ token }).expect(200))
      .body.data;
    expect(preview).toMatchObject({
      store_name: SEED_STORES.main.name,
      email,
      role_name: "Catalog Manager",
      account_exists: false,
    });

    await http()
      .post("/api/v1/invitations/accept-new")
      .send({ token, name: "New Bie", password: "short" })
      .expect(422);
    const joined = await http()
      .post("/api/v1/invitations/accept-new")
      .send({ token, name: "New Bie", password: "welcome-Aboard-1" })
      .expect(200);
    expect(joined.body.data.store_id).toBe(MAIN);
    const me = (await http().get("/api/v1/auth/me").set("Cookie", sessionFrom(joined).cookies)).body
      .data;
    expect(
      me.stores.map((s: { store_id: string; role_key: string }) => [s.store_id, s.role_key]),
    ).toEqual([[MAIN, "catalog_manager"]]);
    // Used up.
    await http().post("/api/v1/invitations/preview").send({ token }).expect(400);
    await http()
      .post("/api/v1/invitations/accept-new")
      .send({ token, name: "Again", password: "welcome-Aboard-1" })
      .expect(400);
    // Already on the team now.
    const again = await admin
      .post("/staff/invitations", { email, role_id: roles.order_manager })
      .expect(409);
    expect(again.body.error.code).toBe("ALREADY_MEMBER");
  });

  it("existing accounts accept while signed in, with the matching email only", async () => {
    const res = await admin
      .post("/staff/invitations", { email: "other@cartforge.test", role_id: roles.order_manager })
      .expect(201);
    const token = tokenOf(res.body.data.url);
    expect(
      (await http().post("/api/v1/invitations/preview").send({ token }).expect(200)).body.data
        .account_exists,
    ).toBe(true);
    await http()
      .post("/api/v1/invitations/accept-new")
      .send({ token, name: "Imposter", password: "welcome-Aboard-1" })
      .expect(409);

    const wrong = await login(app, "catalog@cartforge.test");
    const mismatch = await http()
      .post("/api/v1/invitations/accept")
      .set("Cookie", wrong.cookies)
      .set("X-CSRF-Token", wrong.csrf)
      .send({ token })
      .expect(403);
    expect(mismatch.body.error.code).toBe("INVITATION_EMAIL_MISMATCH");

    const other = await login(app, "other@cartforge.test");
    const ok = await http()
      .post("/api/v1/invitations/accept")
      .set("Cookie", other.cookies)
      .set("X-CSRF-Token", other.csrf)
      .send({ token })
      .expect(200);
    expect(ok.body.data.user.stores.map((s: { store_id: string }) => s.store_id)).toContain(MAIN);
    await api(app, other, MAIN).get("/orders").expect(200);

    // Clean up: other@ is used elsewhere as a single-store owner.
    const team = (await admin.get("/staff").expect(200)).body.data;
    const m = team.members.find((x: { email: string }) => x.email === "other@cartforge.test");
    await admin.delete(`/staff/members/${m.membership_id}`).expect(204);
    await api(app, other, MAIN).get("/orders").expect(403);
  });

  it("changes roles and removes people, but never the owner or yourself", async () => {
    const team = (await admin.get("/staff").expect(200)).body.data;
    const newbie = team.members.find((m: { email: string }) => m.email === mail("newbie"));
    const owner = team.members.find((m: { is_owner: boolean }) => m.is_owner);
    const me = team.members.find((m: { is_you: boolean }) => m.is_you);
    expect(newbie.manageable).toBe(true);

    const updated = await admin
      .patch(`/staff/members/${newbie.membership_id}`, { role_id: roles.order_manager })
      .expect(200);
    expect(
      updated.body.data.members.find((m: { email: string }) => m.email === mail("newbie")).role.key,
    ).toBe("order_manager");
    const ownerRole = (
      await prisma.role.findFirstOrThrow({ where: { store_id: MAIN, key: "owner" } })
    ).id;
    await admin.patch(`/staff/members/${newbie.membership_id}`, { role_id: ownerRole }).expect(422);
    expect(
      (
        await admin
          .patch(`/staff/members/${owner.membership_id}`, { role_id: roles.admin })
          .expect(403)
      ).body.error.code,
    ).toBe("OWNER_PROTECTED");
    await admin.delete(`/staff/members/${owner.membership_id}`).expect(403);
    await admin.delete(`/staff/members/${me.membership_id}`).expect(403);

    await admin.delete(`/staff/members/${newbie.membership_id}`).expect(204);
    const gone = await login(app, mail("newbie"), "welcome-Aboard-1");
    await api(app, gone, MAIN).get("/products").expect(403);
  });

  it("never lets someone hand out more access than they have", async () => {
    const lead = await prisma.role.create({
      data: {
        store_id: MAIN,
        key: `team_lead_${RUN}`,
        name: "Team lead",
        permissions: ["store.read", "staff.read", "staff.write", "products.read"],
      },
    });
    const user = await prisma.user.create({
      data: { email: mail("lead"), name: "Lee", password_hash: await argon2.hash(SEED_PASSWORD) },
    });
    await prisma.storeMembership.create({
      data: { store_id: MAIN, user_id: user.id, role_id: lead.id },
    });
    const leadApi = api(app, await login(app, mail("lead")), MAIN);

    const team = (await leadApi.get("/staff").expect(200)).body.data;
    const assignable = team.roles
      .filter((r: { assignable: boolean }) => r.assignable)
      .map((r: { key: string }) => r.key);
    // Only roles within the lead's own access (earlier runs' identical "Team lead" roles count too).
    expect(assignable).toContain(lead.key);
    expect(assignable.every((k: string) => k.startsWith("team_lead_"))).toBe(true);
    expect(
      (
        await leadApi
          .post("/staff/invitations", { email: mail("y"), role_id: roles.admin })
          .expect(422)
      ).body.error.code,
    ).toBe("ROLE_NOT_ALLOWED");
    await leadApi
      .post("/staff/invitations", { email: mail("y"), role_id: roles.catalog_manager })
      .expect(422);
    await leadApi.post("/staff/invitations", { email: mail("y"), role_id: lead.id }).expect(201);
    // Can't touch an admin either.
    const adminMember = team.members.find(
      (m: { email: string }) => m.email === "admin@cartforge.test",
    );
    expect(adminMember.manageable).toBe(false);
    await leadApi.delete(`/staff/members/${adminMember.membership_id}`).expect(403);
  });

  it("cancels invitations and refuses expired ones", async () => {
    const a = (
      await admin
        .post("/staff/invitations", { email: mail("a"), role_id: roles.order_manager })
        .expect(201)
    ).body.data;
    await admin.delete(`/staff/invitations/${a.id}`).expect(204);
    await http()
      .post("/api/v1/invitations/preview")
      .send({ token: tokenOf(a.url) })
      .expect(400);

    const b = (
      await admin
        .post("/staff/invitations", { email: mail("b"), role_id: roles.order_manager })
        .expect(201)
    ).body.data;
    // Re-inviting the same email replaces the earlier link.
    const b2 = (
      await admin
        .post("/staff/invitations", { email: mail("b"), role_id: roles.catalog_manager })
        .expect(201)
    ).body.data;
    await http()
      .post("/api/v1/invitations/preview")
      .send({ token: tokenOf(b.url) })
      .expect(400);
    await prisma.storeInvitation.update({
      where: { id: b2.id },
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    await http()
      .post("/api/v1/invitations/preview")
      .send({ token: tokenOf(b2.url) })
      .expect(400);
    const listed = (await admin.get("/staff").expect(200)).body.data.invitations.find(
      (i: { id: string }) => i.id === b2.id,
    );
    expect(listed.expired).toBe(true);
  });
});
