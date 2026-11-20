import { Global, Injectable, Module } from "@nestjs/common";
import type { Prisma } from "@cartforge/database";

export interface OutboxInput {
  store_id: string;
  /** e.g. "product.updated", "collection.products_changed" (PRD §21 event names) */
  event_type: string;
  resource_type: string;
  resource_id: string;
  payload?: Prisma.InputJsonValue;
}

/**
 * Transactional outbox (BE-010). Call inside the same transaction as the change,
 * so an event exists if and only if the change committed. A worker job (Next 9)
 * delivers webhooks and invalidates storefront caches from this table.
 */
@Injectable()
export class OutboxService {
  async emit(
    tx: Pick<Prisma.TransactionClient, "outboxEvent">,
    events: OutboxInput | OutboxInput[],
  ): Promise<void> {
    const list = Array.isArray(events) ? events : [events];
    if (!list.length) return;
    await tx.outboxEvent.createMany({
      data: list.map((e) => ({
        store_id: e.store_id,
        event_type: e.event_type,
        resource_type: e.resource_type,
        resource_id: e.resource_id,
        payload: e.payload ?? {},
      })),
    });
  }
}

@Global()
@Module({ providers: [OutboxService], exports: [OutboxService] })
export class OutboxModule {}
