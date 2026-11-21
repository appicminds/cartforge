import "reflect-metadata";
import type { IncomingMessage, ServerResponse } from "node:http";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * Serverless entry (Vercel Functions). The Nest app is created once per warm
 * instance and reused across invocations; only the Express handler is exported.
 * Self-hosted deployments keep using main.ts (a long-running server).
 */
let ready: Promise<Handler> | undefined;

async function bootstrap(): Promise<Handler> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  configureApp(app);
  await app.init();
  return app.getHttpAdapter().getInstance() as Handler;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  ready ??= bootstrap().catch((err: unknown) => {
    ready = undefined; // let the next request retry a failed cold start
    throw err;
  });
  const app = await ready;
  app(req, res);
}
