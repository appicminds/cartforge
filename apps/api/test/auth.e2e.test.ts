import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, login } from "./app";

describe("auth", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects bad credentials with a stable code and request id", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "owner@cartforge.test", password: "wrong" })
      .expect(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(res.body.request_id).toMatch(/^req_/);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("returns field errors for invalid payloads", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "not-an-email" })
      .expect(422);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    const paths = res.body.error.fields.map((f: { path: string }) => f.path);
    expect(paths).toEqual(expect.arrayContaining(["email", "password"]));
  });

  it("sets an HttpOnly session cookie and a readable CSRF cookie", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "OWNER@cartforge.test", password: "CartForge!dev1" })
      .expect(200);
    const cookies: string[] = res.headers["set-cookie"] as unknown as string[];
    const session = cookies.find((c) => c.startsWith("cf_session="))!;
    const csrf = cookies.find((c) => c.startsWith("cf_csrf="))!;
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
    expect(csrf).not.toMatch(/HttpOnly/i);
    expect(res.body.data.email).toBe("owner@cartforge.test");
    expect(res.body.data.stores).toHaveLength(3);
    expect(JSON.stringify(res.body)).not.toContain("password");
  });

  it("returns the current user for a valid session and 401 without one", async () => {
    const s = await login(app, "catalog@cartforge.test");
    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", s.cookies)
      .expect(200);
    expect(me.body.data.stores[0].role_key).toBe("catalog_manager");
    const anon = await request(app.getHttpServer()).get("/api/v1/auth/me").expect(401);
    expect(anon.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("requires the CSRF token for authenticated state changes", async () => {
    const s = await login(app, "admin@cartforge.test");
    const noToken = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", s.cookies)
      .expect(403);
    expect(noToken.body.error.code).toBe("CSRF_INVALID");
    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", s.cookies)
      .set("X-CSRF-Token", "forged")
      .expect(403);
  });

  it("rejects cross-origin state changes", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("Origin", "https://evil.example")
      .send({ email: "owner@cartforge.test", password: "CartForge!dev1" })
      .expect(403);
    expect(res.body.error.code).toBe("CSRF_INVALID");
  });

  it("revokes the session on logout", async () => {
    const s = await login(app, "orders@cartforge.test");
    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", s.cookies)
      .set("X-CSRF-Token", s.csrf)
      .expect(200);
    await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", s.cookies).expect(401);
  });

  it("rate-limits repeated failed logins", async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "ratelimit@cartforge.test", password: "nope" });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
