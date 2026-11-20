import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SEED_PASSWORD } from "@cartforge/database/seed";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { RedisService } from "../src/redis/redis.service";
import { applyTestEnv } from "./test-env";

// Env is read when the app module is instantiated, not at import time.
applyTestEnv();

/** `overrides`: swap providers (e.g. a fake DNS resolver) for one test file. */
export async function createTestApp(
  overrides: { provide: unknown; useValue: unknown }[] = [],
): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  for (const o of overrides) builder = builder.overrideProvider(o.provide).useValue(o.useValue);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  // Login rate-limit counters must not leak between test files.
  await app.get(RedisService).flushdb();
  return app;
}

export interface Session {
  cookies: string[];
  csrf: string;
}

export async function login(
  app: INestApplication,
  email: string,
  password = SEED_PASSWORD,
): Promise<Session> {
  const res = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email, password })
    .expect(200);
  const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
  const csrfCookie = cookies.find((c) => c.startsWith("cf_csrf="));
  if (!csrfCookie) throw new Error("no csrf cookie");
  return {
    cookies: cookies.map((c) => c.split(";")[0]!),
    csrf: csrfCookie.split(";")[0]!.split("=")[1]!,
  };
}

/** Tiny request helper bound to a session + store scope. */
export function api(app: INestApplication, s: Session, storeId: string) {
  const srv = () => request(app.getHttpServer());
  const scoped = (r: request.Test) => r.set("Cookie", s.cookies).set("X-Store-Id", storeId);
  const unsafe = (r: request.Test) => scoped(r).set("X-CSRF-Token", s.csrf);
  return {
    get: (path: string) => scoped(srv().get(`/api/v1${path}`)),
    post: (path: string, body?: object) => unsafe(srv().post(`/api/v1${path}`)).send(body ?? {}),
    patch: (path: string, body: object) => unsafe(srv().patch(`/api/v1${path}`)).send(body),
    put: (path: string, body: object) => unsafe(srv().put(`/api/v1${path}`)).send(body),
    delete: (path: string) => unsafe(srv().delete(`/api/v1${path}`)),
  };
}

/** Unique tag per test run so tests never depend on an empty database. */
export const RUN = `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
