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
});
