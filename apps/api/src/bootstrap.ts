import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import type { ApiEnv } from "./config/env";
import { API_ENV } from "./config/env";

export const API_PREFIX = "api/v1";

/** Shared app configuration for main.ts and integration tests. */
export function configureApp(app: INestApplication): INestApplication {
  const env = app.get<ApiEnv>(API_ENV);
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.enableCors({ origin: env.ADMIN_ORIGIN, credentials: true });
  app.enableShutdownHooks();

  const http = app.getHttpAdapter().getInstance() as {
    set: (k: string, v: unknown) => void;
    disable: (k: string) => void;
  };
  http.disable("x-powered-by");
  // Behind Caddy/Next proxy: trust the first hop for req.ip.
  http.set("trust proxy", 1);

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("CartForge API")
      .setVersion("v1")
      .setDescription(
        "Admin REST API. Cookie session auth; state-changing requests require X-CSRF-Token. " +
          "Store-scoped endpoints require X-Store-Id. Errors: { error: { code, message, fields? }, request_id }.",
      )
      .addCookieAuth("cf_session")
      .build(),
  );
  SwaggerModule.setup("api/docs", app, doc, { jsonDocumentUrl: "api/docs/openapi.json" });
  return app;
}
