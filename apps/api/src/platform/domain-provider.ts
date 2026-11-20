import { Logger } from "@nestjs/common";
import { promises as dns } from "node:dns";
import type { ApiEnv } from "../config/env";

/**
 * Where a verified custom domain must be registered so it is routed to the
 * storefront with HTTPS. Self-hosted/Caddy needs nothing (on-demand TLS asks
 * GET /platform/domains/tls-check); Vercel needs the domain added to the
 * storefront project.
 */
export interface DomainProvider {
  readonly name: string;
  attach(hostname: string): Promise<void>;
  detach(hostname: string): Promise<void>;
}

export const DOMAIN_PROVIDER = Symbol("DOMAIN_PROVIDER");
export const DNS_RESOLVER = Symbol("DNS_RESOLVER");

export interface DnsResolver {
  resolveTxt(name: string): Promise<string[][]>;
}

export const systemDns: DnsResolver = { resolveTxt: (name) => dns.resolveTxt(name) };

const noop: DomainProvider = {
  name: "none",
  attach: async () => undefined,
  detach: async () => undefined,
};

class VercelDomainProvider implements DomainProvider {
  readonly name = "vercel";
  private readonly log = new Logger("VercelDomainProvider");

  constructor(
    private readonly token: string,
    private readonly project: string,
    private readonly team: string | undefined,
  ) {}

  private url(path: string) {
    const q = this.team ? `?teamId=${encodeURIComponent(this.team)}` : "";
    return `https://api.vercel.com${path}${q}`;
  }

  async attach(hostname: string): Promise<void> {
    const res = await fetch(this.url(`/v10/projects/${encodeURIComponent(this.project)}/domains`), {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: hostname }),
      signal: AbortSignal.timeout(10_000),
    });
    // 409: already on the project — fine.
    if (!res.ok && res.status !== 409) {
      const body = await res.text().catch(() => "");
      this.log.warn(`Vercel rejected ${hostname}: ${res.status} ${body.slice(0, 200)}`);
      throw new Error("The hosting provider couldn't add this domain. Try again shortly.");
    }
  }

  async detach(hostname: string): Promise<void> {
    const res = await fetch(
      this.url(
        `/v9/projects/${encodeURIComponent(this.project)}/domains/${encodeURIComponent(hostname)}`,
      ),
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(10_000),
      },
    ).catch(() => null);
    if (res && !res.ok && res.status !== 404)
      this.log.warn(`Vercel detach ${hostname}: ${res.status}`);
  }
}

export function domainProviderFor(env: ApiEnv): DomainProvider {
  if (env.DOMAIN_PROVIDER === "vercel")
    return new VercelDomainProvider(
      env.VERCEL_API_TOKEN!,
      env.VERCEL_STOREFRONT_PROJECT!,
      env.VERCEL_TEAM_ID,
    );
  return noop;
}
