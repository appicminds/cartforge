import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@cartforge/database";
import { COMMERCE_ERROR_CODES } from "@cartforge/types";
import { createHash } from "node:crypto";
import { AppException } from "../common/app-exception";
import { PrismaService } from "../prisma/prisma.service";

/** A key whose first request never finished (crash) can be retried after this. */
const STALE_MS = 2 * 60_000;

export interface IdempotentResult<T> {
  status: number;
  body: T;
  replayed: boolean;
}

export const hashRequest = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(value ?? null))
    .digest("hex");

/**
 * BE-009 / PRD §13.3 rule 13: the first successful response for (store, scope,
 * key) is stored and replayed for retries. Failures are not stored, so a retry
 * after fixing the problem runs again. Concurrent duplicates get 409.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    args: { store_id: string; scope: string; key: string | undefined; request: unknown },
    fn: () => Promise<{ status: number; body: T }>,
  ): Promise<IdempotentResult<T>> {
    const key = args.key?.trim();
    if (!key || key.length > 200 || !/^[\x21-\x7e]+$/.test(key)) {
      throw new AppException(
        COMMERCE_ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
        "Send a unique Idempotency-Key header (up to 200 visible characters).",
        HttpStatus.BAD_REQUEST,
      );
    }
    const where = { store_id_scope_key: { store_id: args.store_id, scope: args.scope, key } };
    const request_hash = hashRequest(args.request);
    for (let attempt = 0; ; attempt++) {
      try {
        await this.prisma.idempotencyKey.create({
          data: { store_id: args.store_id, scope: args.scope, key, request_hash },
        });
        break;
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"))
          throw err;
        const row = await this.prisma.idempotencyKey.findUnique({ where });
        if (!row) continue; // deleted meanwhile: try again
        if (row.request_hash !== request_hash) {
          throw new AppException(
            COMMERCE_ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
            "This Idempotency-Key was already used for a different request.",
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
        if (row.status_code !== null) {
          return { status: row.status_code, body: row.response as T, replayed: true };
        }
        if (Date.now() - row.created_at.getTime() > STALE_MS && attempt === 0) {
          await this.prisma.idempotencyKey.deleteMany({ where: { id: row.id, status_code: null } });
          continue;
        }
        throw new AppException(
          COMMERCE_ERROR_CODES.REQUEST_IN_PROGRESS,
          "This request is already being processed.",
          HttpStatus.CONFLICT,
        );
      }
    }
    try {
      const result = await fn();
      await this.prisma.idempotencyKey.update({
        where,
        data: { status_code: result.status, response: result.body as Prisma.InputJsonValue },
      });
      return { ...result, replayed: false };
    } catch (err) {
      await this.prisma.idempotencyKey.deleteMany({
        where: { ...where.store_id_scope_key, status_code: null },
      });
      throw err;
    }
  }
}
