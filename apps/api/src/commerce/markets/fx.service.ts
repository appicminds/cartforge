import { Inject, Injectable, Logger } from "@nestjs/common";
import { API_ENV, type ApiEnv } from "../../config/env";
import { PrismaService } from "../../prisma/prisma.service";
import type { PaymentHttp } from "../payments/provider";

export const FX_HTTP = Symbol("FX_HTTP");

/** Live rates older than this are refreshed when next needed. */
const FRESH_MS = 12 * 3600_000;
/** Rates older than this are no longer used (the market is paused instead). */
const MAX_AGE_MS = 7 * 24 * 3600_000;

export interface LiveRate {
  /** Quote units per 1 base unit. */
  rate: number;
  fetched_at: Date;
}

/**
 * Live exchange rates (Markets "live rate" mode). Rates are stored against USD
 * (the free Open Exchange Rates plan's base) and crossed; a failed refresh keeps
 * using the last good rates for up to a week.
 */
@Injectable()
export class FxService {
  private readonly log = new Logger("FxService");
  private refreshing: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(FX_HTTP) private readonly http: PaymentHttp,
  ) {}

  get available(): boolean {
    return this.env.FX_PROVIDER === "openexchangerates" && !!this.env.FX_API_KEY;
  }

  async rate(base: string, quote: string): Promise<LiveRate | null> {
    if (base === quote) return { rate: 1, fetched_at: new Date() };
    if (!this.available) return null;
    let rows = await this.load(base, quote);
    const oldest = rows && Math.min(rows.b.fetched_at.getTime(), rows.q.fetched_at.getTime());
    if (!rows || Date.now() - oldest! > FRESH_MS) {
      await this.refresh();
      rows = (await this.load(base, quote)) ?? rows;
    }
    if (!rows) return null;
    const fetched = new Date(Math.min(rows.b.fetched_at.getTime(), rows.q.fetched_at.getTime()));
    if (Date.now() - fetched.getTime() > MAX_AGE_MS) return null;
    return { rate: rows.q.rate / rows.b.rate, fetched_at: fetched };
  }

  private async load(base: string, quote: string) {
    const found = await this.prisma.fxRate.findMany({
      where: { base: "USD", quote: { in: [base, quote] } },
    });
    const get = (c: string) =>
      c === "USD"
        ? { rate: 1, fetched_at: found[0]?.fetched_at ?? new Date() }
        : (() => {
            const r = found.find((x) => x.quote === c);
            return r ? { rate: Number(r.rate), fetched_at: r.fetched_at } : null;
          })();
    const b = get(base);
    const q = get(quote);
    if (!b || !q || (base === "USD" && quote === "USD") || found.length === 0) return null;
    return { b, q };
  }

  /** One refresh at a time; failures are logged and the old rates stay. */
  async refresh(): Promise<void> {
    this.refreshing ??= this.doRefresh().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async doRefresh() {
    try {
      const res = await this.http.request(
        `https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(this.env.FX_API_KEY ?? "")}`,
        { method: "GET" },
      );
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const body = JSON.parse(res.text) as { base?: string; rates?: Record<string, number> };
      if (body.base !== "USD" || !body.rates) throw new Error("unexpected response");
      const now = new Date();
      const entries = Object.entries(body.rates).filter(
        ([c, r]) => /^[A-Z]{3}$/.test(c) && Number.isFinite(r) && r > 0,
      );
      await this.prisma.$transaction(
        entries.map(([quote, rate]) =>
          this.prisma.fxRate.upsert({
            where: { base_quote: { base: "USD", quote } },
            create: { base: "USD", quote, rate, fetched_at: now },
            update: { rate, fetched_at: now },
          }),
        ),
      );
    } catch (err) {
      this.log.warn(`Exchange-rate refresh failed: ${(err as Error).message}`);
    }
  }
}
