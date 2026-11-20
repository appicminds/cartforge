import type { INestApplication } from "@nestjs/common";
import argon2 from "argon2";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@cartforge/database";
import { Mailer, type Email } from "../src/mail/mailer";
import { createTestApp, login, RUN, type Session } from "./app";
import { TEST_ENV } from "./test-env";

/** Change password, forgot/reset by email link, and platform-admin reset links. */
describe("account: change and reset password", () => {
  let app: INestApplication;
  const prisma = createPrismaClient(TEST_ENV.DATABASE_URL);
  const sent: Email[] = [];
  const fakeMailer = { enabled: true, send: async (e: Email) => (sent.push(e), true) };
  const http = () => request(app.getHttpServer());
  const email = `pw-${RUN}@example.com`.toLowerCase();
  let password = "first-Password-1";

  const me = (s: Session) => http().get("/api/v1/auth/me").set("Cookie", s.cookies);
  const post = (path: string, body: object, s?: Session) => {
    const r = http().post(`/api/v1${path}`);
    if (s) r.set("Cookie", s.cookies).set("X-CSRF-Token", s.csrf);
    return r.send(body);
  };
  const tokenFrom = (text: string) => /reset-password\?token=([\w-]+)/.exec(text)?.[1];

  beforeAll(async () => {
    process.env.CARTFORGE_EDITION = "saas"; // sign-up on, for the verification tests
    app = await createTestApp([{ provide: Mailer, useValue: fakeMailer }]);
    await prisma.user.create({
      data: { email, name: "Pat", password_hash: await argon2.hash(password) },
    });
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("changes the password, keeping this session and ending the others", async () => {
    const here = await login(app, email, password);
    const elsewhere = await login(app, email, password);

    const wrong = await post(
      "/auth/password",
      { current_password: "nope-nope-1234", new_password: "second-Password-2" },
      here,
    ).expect(422);
    expect(wrong.body.error.fields[0].path).toBe("current_password");
    await post(
      "/auth/password",
      { current_password: password, new_password: "short" },
      here,
    ).expect(422);

    await post(
      "/auth/password",
      { current_password: password, new_password: "second-Password-2" },
      here,
    ).expect(204);
    password = "second-Password-2";
    await me(here).expect(200);
    await me(elsewhere).expect(401);
    await http()
      .post("/api/v1/auth/login")
      .send({ email, password: "first-Password-1" })
      .expect(401);
    await login(app, email, password);
  });

  it("emails a one-time reset link without revealing which emails exist", async () => {
    sent.length = 0;
    const unknown = await post("/auth/password/forgot", { email: `nobody-${RUN}@example.com` });
    expect(unknown.status).toBe(202);
    expect(sent).toHaveLength(0);

    const res = await post("/auth/password/forgot", { email: email.toUpperCase() }).expect(202);
    // Same answer either way.
    expect(res.body.data).toEqual(unknown.body.data);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(email);
    const token = tokenFrom(sent[0]!.text)!;
    expect(token).toBeTruthy();
    expect(sent[0]!.html).toContain(`token=${token}`);

    const session = await login(app, email, password);
    await post("/auth/password/reset", { token, new_password: "weak" }).expect(422);
    await post("/auth/password/reset", { token, new_password: "third-Password-3" }).expect(204);
    password = "third-Password-3";
    // Used up, and every session ended.
    const again = await post("/auth/password/reset", {
      token,
      new_password: "fourth-Password-4",
    }).expect(400);
    expect(again.body.error.code).toBe("RESET_LINK_INVALID");
    await me(session).expect(401);
    await login(app, email, password);
  });

  it("refuses expired and made-up links, and limits emails per account", async () => {
    sent.length = 0;
    await post("/auth/password/forgot", { email }).expect(202);
    const token = tokenFrom(sent[0]!.text)!;
    await prisma.passwordResetToken.updateMany({
      where: { used_at: null, user: { email } },
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    await post("/auth/password/reset", { token, new_password: "fifth-Password-5" }).expect(400);
    await post("/auth/password/reset", {
      token: "x".repeat(43),
      new_password: "fifth-Password-5",
    }).expect(400);

    // Three emailed links per hour at most (one was sent in the previous test, one above).
    await post("/auth/password/forgot", { email }).expect(202);
    await post("/auth/password/forgot", { email }).expect(202);
    expect(sent).toHaveLength(2);
  });

  it("lets platform admins create a reset link for a merchant, and nobody else", async () => {
    const staff = await login(app, "owner@cartforge.test");
    await post("/platform/users/reset-link", { email }, staff).expect(403);

    const admin = await login(app, "platform@cartforge.test");
    await post("/platform/users/reset-link", { email: `nobody-${RUN}@example.com` }, admin).expect(
      404,
    );
    await post("/platform/users/reset-link", { email: "platform@cartforge.test" }, admin).expect(
      403,
    );
    const link = (await post("/platform/users/reset-link", { email }, admin).expect(200)).body.data;
    expect(link.url).toMatch(/\/reset-password\?token=/);
    expect(Date.parse(link.expires_at)).toBeGreaterThan(Date.now() + 50 * 60_000);

    await post("/auth/password/reset", {
      token: tokenFrom(link.url),
      new_password: "admin-Given-6",
    }).expect(204);
    await login(app, email, "admin-Given-6");
  });

  describe("email verification", () => {
    const vEmail = `verify-${RUN}@example.com`.toLowerCase();
    const verifyToken = (text: string) => /verify-email\?token=([\w-]+)/.exec(text)?.[1];
    let session: Session;

    it("sends a link on sign-up, and blocks inviting people until confirmed", async () => {
      sent.length = 0;
      const res = await post("/auth/signup", {
        name: "Vera",
        email: vEmail,
        password: "verify-Me-please-1",
        store_name: `Vera Goods ${RUN}`,
        currency: "USD",
      }).expect(201);
      const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
      session = {
        cookies: cookies.map((c) => c.split(";")[0]!),
        csrf: cookies
          .find((c) => c.startsWith("cf_csrf="))!
          .split(";")[0]!
          .split("=")[1]!,
      };
      expect(res.body.data.email_verified).toBe(false);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe(vEmail);

      const storeId = res.body.data.stores[0].store_id;
      const roles = (
        await http().get("/api/v1/staff").set("Cookie", session.cookies).set("X-Store-Id", storeId)
      ).body.data.roles;
      const blocked = await http()
        .post("/api/v1/staff/invitations")
        .set("Cookie", session.cookies)
        .set("X-CSRF-Token", session.csrf)
        .set("X-Store-Id", storeId)
        .send({ email: `helper-${RUN}@example.com`, role_id: roles[0].id })
        .expect(403);
      expect(blocked.body.error.code).toBe("EMAIL_NOT_VERIFIED");

      const token = verifyToken(sent[0]!.text)!;
      await post("/auth/email/verify", { token }).expect(204);
      expect((await me(session).expect(200)).body.data.email_verified).toBe(true);
      await post("/auth/email/verify", { token }).expect(400);
      await http()
        .post("/api/v1/staff/invitations")
        .set("Cookie", session.cookies)
        .set("X-CSRF-Token", session.csrf)
        .set("X-Store-Id", storeId)
        .send({ email: `helper-${RUN}@example.com`, role_id: roles[0].id })
        .expect(201);
    });

    it("resends a few times only, and nothing once verified", async () => {
      const u = `resend-${RUN}@example.com`.toLowerCase();
      await prisma.user.create({
        data: { email: u, name: "Res", password_hash: await argon2.hash("resend-Me-please-1") },
      });
      const s = await login(app, u, "resend-Me-please-1");
      sent.length = 0;
      for (let i = 0; i < 3; i++)
        expect((await post("/auth/email/resend", {}, s).expect(200)).body.data.emailed).toBe(true);
      await post("/auth/email/resend", {}, s).expect(429);
      expect(sent).toHaveLength(3);
      // Already verified (Vera above): nothing to send.
      expect((await post("/auth/email/resend", {}, session).expect(200)).body.data.emailed).toBe(
        false,
      );
    });

    it("an emailed reset link also confirms the address; an admin-made one doesn't", async () => {
      const a = `reset-verify-${RUN}@example.com`.toLowerCase();
      await prisma.user.create({
        data: { email: a, name: "Rae", password_hash: await argon2.hash("whatever-Pass-1") },
      });
      const admin = await login(app, "platform@cartforge.test");
      const link = (await post("/platform/users/reset-link", { email: a }, admin).expect(200)).body
        .data;
      await post("/auth/password/reset", {
        token: tokenFrom(link.url),
        new_password: "admin-Made-link-1",
      }).expect(204);
      expect((await prisma.user.findUniqueOrThrow({ where: { email: a } })).email_verified_at).toBe(
        null,
      );

      sent.length = 0;
      await post("/auth/password/forgot", { email: a }).expect(202);
      await post("/auth/password/reset", {
        token: tokenFrom(sent[0]!.text),
        new_password: "emailed-Link-ok-1",
      }).expect(204);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { email: a } })).email_verified_at,
      ).not.toBe(null);
    });
  });
});
