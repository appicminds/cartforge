import { type ApiEnv } from "@cartforge/config";

/** DI token for the validated environment. */
export const API_ENV = Symbol("API_ENV");
export type { ApiEnv };
