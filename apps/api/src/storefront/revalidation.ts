import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { from, mergeMap, type Observable } from "rxjs";
import { API_ENV, type ApiEnv } from "../config/env";

const INVALIDATES = "cartforge:invalidates-storefront";

/**
 * Successful writes on a decorated controller (or handler) tell the storefront
 * its catalog cache is stale (PRD §8.8 #10). Pass `false` on a handler to opt out.
 */
export const InvalidatesStorefront = (on = true) => SetMetadata(INVALIDATES, on);

/** Cache tag every storefront catalog read is filed under. */
export const CATALOG_TAG = "catalog";

@Injectable()
export class StorefrontRevalidator {
  private readonly log = new Logger("StorefrontRevalidator");

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  get enabled(): boolean {
    return !!this.env.STOREFRONT_REVALIDATE_URL;
  }

  /**
   * Best effort, bounded: a slow or unreachable storefront never fails the admin
   * write; its time-based revalidation still converges within minutes.
   */
  async notify(tags: string[] = [CATALOG_TAG]): Promise<void> {
    const url = this.env.STOREFRONT_REVALIDATE_URL;
    if (!url) return;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-revalidate-secret": this.env.STOREFRONT_REVALIDATE_SECRET ?? "",
        },
        body: JSON.stringify({ tags }),
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) this.log.warn(`Storefront revalidation answered ${res.status}`);
    } catch (err) {
      this.log.warn(`Storefront revalidation failed: ${(err as Error).message}`);
    }
  }
}

@Injectable()
export class StorefrontRevalidationInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly revalidator: StorefrontRevalidator,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const method = ctx.switchToHttp().getRequest<Request>().method;
    const on = this.reflector.getAllAndOverride<boolean | undefined>(INVALIDATES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!on || method === "GET" || method === "HEAD" || !this.revalidator.enabled)
      return next.handle();
    // Only this store's storefront pages are purged (shared storefront, P1).
    const req = ctx.switchToHttp().getRequest<Request>();
    const storeId = req.store?.store_id ?? req.get("x-store-id");
    const tags =
      storeId && /^[0-9a-f-]{36}$/i.test(storeId)
        ? [`${CATALOG_TAG}:${storeId.toLowerCase()}`]
        : [CATALOG_TAG];
    // Runs only after the handler succeeded (its transaction has committed).
    return next
      .handle()
      .pipe(mergeMap((value) => from(this.revalidator.notify(tags).then(() => value))));
  }
}
