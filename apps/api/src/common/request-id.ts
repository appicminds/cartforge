import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { HEADERS } from "@cartforge/types";

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Request ID for correlation (Appendix B). Accepts a well-formed inbound
 * X-Request-Id (e.g. from the admin client or reverse proxy), else generates one.
 */
export function genRequestId(req: IncomingMessage, res: ServerResponse): string {
  const inbound = req.headers[HEADERS.REQUEST_ID];
  const id = typeof inbound === "string" && SAFE_ID.test(inbound) ? inbound : `req_${randomUUID()}`;
  res.setHeader("X-Request-Id", id);
  return id;
}
