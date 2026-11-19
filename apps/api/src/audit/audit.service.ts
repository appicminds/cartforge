import { Global, Injectable, Logger, Module } from "@nestjs/common";
import type { Prisma } from "@cartforge/database";
import { PrismaService } from "../prisma/prisma.service";

export interface AuditEntry {
  action: string;
  resource_type: string;
  resource_id?: string | null;
  store_id?: string | null;
  actor_user_id: string | null;
  /** Before/after or context. Callers must not include secrets or raw PII. */
  metadata?: Prisma.InputJsonValue;
  ip?: string;
  request_id?: string;
}

/** Records security-sensitive and financial actions (BE-006). */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Standalone write. Use `recordIn(tx, …)` instead when the audited change is
   * part of a transaction so both commit or roll back together.
   */
  async record(entry: AuditEntry): Promise<void> {
    await this.recordIn(this.prisma, entry);
  }

  async recordIn(
    client: Pick<Prisma.TransactionClient, "auditLog">,
    entry: AuditEntry,
  ): Promise<void> {
    await client.auditLog.create({
      data: {
        action: entry.action,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id ?? null,
        store_id: entry.store_id ?? null,
        actor_user_id: entry.actor_user_id,
        metadata: entry.metadata ?? {},
        ip: entry.ip,
        request_id: entry.request_id,
      },
    });
    this.logger.debug({ action: entry.action, resource_type: entry.resource_type }, "audit");
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
