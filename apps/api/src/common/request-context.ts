import type { Permission } from "@cartforge/types";

export interface AuthContext {
  user_id: string;
  session_id: string;
  email: string;
  name: string;
}

export interface StoreContext {
  store_id: string;
  role_key: string;
  permissions: ReadonlySet<Permission>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      store?: StoreContext;
      /** Raw session token from the cookie; only used for CSRF derivation. */
      sessionToken?: string;
    }
  }
}
