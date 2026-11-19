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

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
