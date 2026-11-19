import {
  COOKIES,
  ERROR_CODES,
  HEADERS,
  type ApiErrorBody,
  type FieldError,
} from "@cartforge/types";

/**
 * Central API client (FE-003): base URL, cookie auth, request IDs, CSRF header,
 * store scope header, and error normalization into ApiError.
 */
export const API_BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId: string | null,
    public readonly fields: FieldError[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function readCookie(name: string, cookieString: string): string | null {
  for (const part of cookieString.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function newRequestId(): string {
  return `req_${crypto.randomUUID()}`;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  storeId?: string | null;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | null>;
}

export async function normalizeError(res: Response, requestId: string): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | null = null;
  try {
    body = (await res.json()) as Partial<ApiErrorBody>;
  } catch {
    // Non-JSON error (proxy, gateway). Fall through to a generic message.
  }
  const rid = body?.request_id ?? res.headers.get("x-request-id") ?? requestId;
  if (body?.error?.code) {
    return new ApiError(
      res.status,
      body.error.code,
      body.error.message ?? "Request failed.",
      rid,
      body.error.fields ?? [],
    );
  }
  const message =
    res.status >= 500
      ? "The server had a problem handling this request. Please try again."
      : `Request failed (${res.status}).`;
  return new ApiError(
    res.status,
    res.status >= 500 ? ERROR_CODES.INTERNAL_ERROR : "HTTP_ERROR",
    message,
    rid,
  );
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? "GET";
  const requestId = newRequestId();
  const headers: Record<string, string> = {
    Accept: "application/json",
    [HEADERS.REQUEST_ID]: requestId,
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.storeId) headers[HEADERS.STORE_ID] = opts.storeId;
  if (UNSAFE.has(method) && typeof document !== "undefined") {
    const csrf = readCookie(COOKIES.CSRF, document.cookie);
    if (csrf) headers[HEADERS.CSRF] = csrf;
  }

  let url = `${API_BASE}${path}`;
  if (opts.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query))
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: "same-origin",
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Can't reach the server. Check your connection and try again.",
      requestId,
    );
  }

  if (!res.ok) throw await normalizeError(res, requestId);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** TanStack Query retry policy: retry network/5xx up to twice, never 4xx. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && !error.isNetwork && error.status < 500) return false;
  return failureCount < 2;
}
