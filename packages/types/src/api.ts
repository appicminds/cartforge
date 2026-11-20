/** API envelope contracts (PRD §8.10, BE-007, Appendix B). */

export interface FieldError {
  path: string;
  message: string;
  code?: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: FieldError[];
  };
  request_id: string;
}

export interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface ListResponse<T> {
  data: T[];
  meta: PaginationMeta;
  request_id: string;
}

export interface DetailResponse<T> {
  data: T;
  request_id: string;
}

/** Stable machine-readable error codes. Add new codes here; never repurpose. */
export const ERROR_CODES = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  CSRF_INVALID: "CSRF_INVALID",
  FORBIDDEN: "FORBIDDEN",
  STORE_SCOPE_REQUIRED: "STORE_SCOPE_REQUIRED",
  STORE_ACCESS_DENIED: "STORE_ACCESS_DENIED",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  RESET_LINK_INVALID: "RESET_LINK_INVALID",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Header names shared by admin client and API. */
export const HEADERS = {
  REQUEST_ID: "x-request-id",
  STORE_ID: "x-store-id",
  CSRF: "x-csrf-token",
} as const;

export const COOKIES = {
  SESSION: "cf_session",
  CSRF: "cf_csrf",
} as const;
