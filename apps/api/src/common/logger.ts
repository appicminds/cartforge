import type { Params } from "nestjs-pino";
import type { ApiEnv } from "../config/env";
import { genRequestId } from "./request-id";

/** Structured logging with secrets/PII redaction (BE-011, FE-008). */
export function loggerParams(env: ApiEnv): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId: genRequestId,
      customProps: (req) => {
        const r = req as Express.Request & { id?: unknown };
        return { request_id: r.id, user_id: r.auth?.user_id, store_id: r.store?.store_id };
      },
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers['x-csrf-token']",
          "res.headers['set-cookie']",
          "*.password",
          "*.password_hash",
          "*.token",
          "*.secret",
        ],
        censor: "[REDACTED]",
      },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
      },
      transport:
        env.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { singleLine: true } }
          : undefined,
      autoLogging: { ignore: (req) => req.url?.startsWith("/api/v1/health") ?? false },
    },
  };
}
