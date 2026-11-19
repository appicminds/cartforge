import { describe, expect, it } from "vitest";
import { ApiError, normalizeError, readCookie, shouldRetry } from "./api-client";

describe("normalizeError", () => {
  it("maps the API envelope", async () => {
    const res = new Response(
      JSON.stringify({
        error: {
          code: "VALIDATION_FAILED",
          message: "Bad",
          fields: [{ path: "email", message: "Invalid" }],
        },
        request_id: "req_1",
      }),
      { status: 422 },
    );
    const err = await normalizeError(res, "req_local");
    expect(err).toMatchObject({ status: 422, code: "VALIDATION_FAILED", requestId: "req_1" });
    expect(err.fields).toHaveLength(1);
  });

  it("does not surface hosting/proxy error messages as API errors", async () => {
    const res = new Response(
      JSON.stringify({
        error: {
          code: "DEPLOYMENT_NOT_FOUND",
          message: "The deployment could not be found on Vercel.",
        },
      }),
      { status: 404 },
    );
    const err = await normalizeError(res, "req_local");
    expect(err.code).toBe("SERVICE_UNAVAILABLE");
    expect(err.message).not.toContain("Vercel");
  });

  it("handles non-JSON gateway errors without leaking bodies", async () => {
    const err = await normalizeError(
      new Response("<html>502</html>", { status: 502 }),
      "req_local",
    );
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.message).not.toContain("html");
    expect(err.requestId).toBe("req_local");
  });
});

describe("shouldRetry", () => {
  it("never retries client errors", () => {
    expect(shouldRetry(0, new ApiError(403, "FORBIDDEN", "x", null))).toBe(false);
  });
  it("retries network and server errors twice", () => {
    const net = new ApiError(0, "NETWORK_ERROR", "x", null);
    expect(shouldRetry(0, net)).toBe(true);
    expect(shouldRetry(2, net)).toBe(false);
    expect(shouldRetry(1, new ApiError(503, "INTERNAL_ERROR", "x", null))).toBe(true);
  });
});

describe("readCookie", () => {
  it("reads a named cookie", () => {
    expect(readCookie("cf_csrf", "a=1; cf_csrf=abc%3D; b=2")).toBe("abc=");
    expect(readCookie("missing", "a=1")).toBeNull();
  });
});
