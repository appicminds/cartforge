import type { INestApplication } from "@nestjs/common";
import argon2 from "argon2";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@cartforge/database";
import { base32Decode, hotp, stepAt } from "../src/auth/totp";
import { createTestApp, login, RUN, type Session } from "./app";
import { TEST_ENV } from "./test-env";

/** Next 1: two-factor sign-in with an authenticator app and recovery codes. */
describe("two-factor sign-in", () => {
  let app: INestApplication;
  const prisma = createPrismaClient(TEST_ENV.DATABASE_URL);
  const http = () => request(app.getHttpServer());
  const email = `mfa-${RUN}@example.com`.toLowerCase();
  const password = "two-Factor-pass-1";
  let secret = "";
  let recovery: string[] = [];
  let session: Session;

  /** The code an authenticator app would show `offset` steps from now. */
  const code = (offset = 0) => hotp(base32Decode(secret), stepAt(Date.now()) + BigInt(offset));
  const post = (path: string, body: object, s?: Session) => {
    const r = http().post(`/api/v1${path}`);
    if (s) r.set("Cookie", s.cookies).set("X-CSRF-Token", s.csrf);
    return r.send(body);
  };
  const passwordStep = () => post("/auth/login", { email, password }).expect(200);

  beforeAll(async () => {
    app = await createTestApp();
    await prisma.user.create({
      data: { email, name: "Mo", password_hash: await argon2.hash(password) },
    });
    session = await login(app, email, password);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("turns on with a code from the app and hands out recovery codes once", async () => {
    expect(
      (await http().get("/api/v1/auth/mfa").set("Cookie", session.cookies).expect(200)).body.data,
    ).toEqual({ enabled: false, recovery_codes_left: 0 });
    const setup = (await post("/auth/mfa/setup", {}, session).expect(200)).body.data;
    secret = setup.secret;
    expect(setup.otpauth_url).toContain(`secret=${secret}`);
    // Stored encrypted, never as the plain secret.
    const row = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(row.totp_pending_secret).toMatch(/^v1\./);
    expect(row.totp_pending_secret).not.toContain(secret);

    await post("/auth/mfa/enable", { code: "000000" }, session).expect(422);
    const res = await post("/auth/mfa/enable", { code: code() }, session).expect(200);
    recovery = res.body.data.recovery_codes;
    expect(recovery).toHaveLength(10);
    const me = (await http().get("/api/v1/auth/me").set("Cookie", session.cookies)).body.data;
    expect(me.mfa_enabled).toBe(true);
    await post("/auth/mfa/setup", {}, session).expect(409);
  });

  it("asks for a code after the password, and refuses wrong or reused codes", async () => {
    const step1 = await passwordStep();
    expect(step1.body.data).toEqual({ mfa_required: true, mfa_token: expect.any(String) });
    expect(step1.headers["set-cookie"]).toBeUndefined();
    const token = step1.body.data.mfa_token;

    const wrong = await post("/auth/login/mfa", { mfa_token: token, code: "123456" }).expect(422);
    expect(wrong.body.error.code).toBe("INVALID_MFA_CODE");
    // The next step's code is valid (clock drift) and hasn't been used yet.
    const fresh = code(1);
    const ok = await post("/auth/login/mfa", { mfa_token: token, code: fresh }).expect(200);
    expect(ok.body.data.email).toBe(email);
    expect(([] as string[]).concat(ok.headers["set-cookie"] ?? []).join(";")).toContain(
      "cf_session=",
    );
    // The challenge is used up, and the same code can't sign in again.
    await post("/auth/login/mfa", { mfa_token: token, code: fresh }).expect(401);
    const again = (await passwordStep()).body.data.mfa_token;
    await post("/auth/login/mfa", { mfa_token: again, code: fresh }).expect(422);
    await post("/auth/login/mfa", { mfa_token: "x".repeat(43), code: fresh }).expect(401);
  });

  it("accepts each recovery code once, and can replace them", async () => {
    const token = (await passwordStep()).body.data.mfa_token;
    await post("/auth/login/mfa", {
      mfa_token: token,
      code: recovery[0]!.toUpperCase().replace("-", " "),
    }).expect(200);
    const token2 = (await passwordStep()).body.data.mfa_token;
    await post("/auth/login/mfa", { mfa_token: token2, code: recovery[0] }).expect(422);
    expect(
      (await http().get("/api/v1/auth/mfa").set("Cookie", session.cookies)).body.data
        .recovery_codes_left,
    ).toBe(9);

    const fresh = (
      await post("/auth/mfa/recovery-codes", { code: recovery[1] }, session).expect(200)
    ).body.data.recovery_codes;
    expect(fresh).toHaveLength(10);
    await post("/auth/login/mfa", { mfa_token: token2, code: recovery[2] }).expect(422);
    recovery = fresh;
  });

  it("turns off with the password and a code", async () => {
    await post(
      "/auth/mfa/disable",
      { password: "wrong-pass-123", code: recovery[0] },
      session,
    ).expect(422);
    await post("/auth/mfa/disable", { password, code: "000000" }, session).expect(422);
    await post("/auth/mfa/disable", { password, code: recovery[0] }, session).expect(204);
    const res = await passwordStep();
    expect(res.body.data.email).toBe(email);
    expect(res.body.data.mfa_enabled).toBe(false);
  });

  it("platform admins can turn it off for someone locked out; nobody else can", async () => {
    secret = (await post("/auth/mfa/setup", {}, session).expect(200)).body.data.secret;
    await post("/auth/mfa/enable", { code: code() }, session).expect(200);
    expect((await passwordStep()).body.data.mfa_required).toBe(true);

    const owner = await login(app, "owner@cartforge.test");
    await post("/platform/users/mfa-reset", { email }, owner).expect(403);
    const admin = await login(app, "platform@cartforge.test");
    await post("/platform/users/mfa-reset", { email }, admin).expect(204);
    await post("/platform/users/mfa-reset", { email }, admin).expect(409);
    expect((await passwordStep()).body.data.email).toBe(email);
  });
});
