/**
 * Minimal admin-API client for arranging test data. Talks to the API directly,
 * as the admin would (session cookie + CSRF + allowed Origin).
 */
const API = process.env.API_URL ?? "http://localhost:4000";
const ORIGIN = (process.env.ADMIN_ORIGIN ?? "http://localhost:3000").split(",")[0]!.trim();
export const STORE = process.env.STOREFRONT_STORE_ID ?? "00000000-0000-4000-8000-000000000001";
export const RUN = Date.now().toString(36);

export class CatalogApi {
  private constructor(
    private readonly cookie: string,
    private readonly csrf: string,
  ) {}

  static async login(email = "owner@cartforge.test", password = "CartForge!dev1") {
    const res = await fetch(`${API}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`login failed: ${res.status}`);
    const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]!);
    const csrf = cookies.find((c) => c.startsWith("cf_csrf="))!.split("=")[1]!;
    return new CatalogApi(cookies.join("; "), csrf);
  }

  async call<T = { id: string; handle: string }>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${API}/api/v1${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        cookie: this.cookie,
        "x-csrf-token": this.csrf,
        "x-store-id": STORE,
        origin: ORIGIN,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { data: T };
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
    return json.data;
  }

  post = <T = { id: string; handle: string }>(path: string, body?: unknown) =>
    this.call<T>("POST", path, body ?? {});
  patch = <T = { id: string; handle: string }>(path: string, body: unknown) =>
    this.call<T>("PATCH", path, body);
  put = <T = { id: string; handle: string }>(path: string, body: unknown) =>
    this.call<T>("PUT", path, body);
}
