import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./app";

describe("platform", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("reports liveness and readiness", async () => {
    await request(app.getHttpServer()).get("/api/v1/health").expect(200);
    const ready = await request(app.getHttpServer()).get("/api/v1/health/ready").expect(200);
    expect(ready.body.checks.database.status).toBe("ok");
    expect(ready.body.checks.redis.status).toBe("ok");
  });

  it("echoes a well-formed inbound request id and rejects unsafe ones", async () => {
    const ok = await request(app.getHttpServer())
      .get("/api/v1/health")
      .set("X-Request-Id", "abc-123");
    expect(ok.headers["x-request-id"]).toBe("abc-123");
    const bad = await request(app.getHttpServer())
      .get("/api/v1/health")
      .set("X-Request-Id", "<script>");
    expect(bad.headers["x-request-id"]).toMatch(/^req_/);
  });

  it("returns the error envelope for unknown routes", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/nope").expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body).toHaveProperty("request_id");
  });

  it("returns a clean 400 for malformed JSON", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send("{bad json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(JSON.stringify(res.body)).not.toMatch(/SyntaxError|at JSON/);
  });

  it("documents a request body for every write endpoint (generated from the validation schemas)", async () => {
    const doc = (await request(app.getHttpServer()).get("/api/docs/openapi.json").expect(200)).body;
    // Endpoints that intentionally take no body.
    const noBody = new Set([
      "post /api/v1/auth/logout",
      "post /api/v1/products/{id}/publish",
      "post /api/v1/products/{id}/archive",
    ]);
    const missing: string[] = [];
    for (const [path, ops] of Object.entries(
      doc.paths as Record<string, Record<string, { requestBody?: unknown }>>,
    )) {
      for (const [method, op] of Object.entries(ops)) {
        if (!["post", "put", "patch"].includes(method)) continue;
        if (!op.requestBody && !noBody.has(`${method} ${path}`))
          missing.push(`${method.toUpperCase()} ${path}`);
      }
    }
    expect(missing).toEqual([]);
    const create =
      doc.paths["/api/v1/products"].post.requestBody.content["application/json"].schema;
    expect(create.required).toContain("title");
    expect(create.properties.price_minor).toBeDefined();
  });

  it("publishes the OpenAPI document", async () => {
    const res = await request(app.getHttpServer()).get("/api/docs/openapi.json").expect(200);
    expect(res.body.paths).toHaveProperty("/api/v1/store");
    expect(res.body.paths).toHaveProperty("/api/v1/auth/login");
  });
});
