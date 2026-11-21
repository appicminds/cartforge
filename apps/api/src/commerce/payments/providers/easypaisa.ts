import { createCipheriv } from "node:crypto";
import { fromUnits, toUnits } from "../amounts";
import { ProviderError, type OnlineProvider, type ProviderContext } from "../provider";

const HOSTS = {
  test: "https://easypaystg.easypaisa.com.pk",
  live: "https://easypay.easypaisa.com.pk",
} as const;

/** "1000.0"-style rupee amount Easypay expects. */
export const easypayAmount = (minor: number) => {
  const paisa = toUnits(minor, "PKR", 2);
  return paisa % 100 === 0 ? `${paisa / 100}.0` : (paisa / 100).toFixed(2);
};

/**
 * merchantHashedReq: the request's parameters sorted by name as `k=v&…`,
 * AES-128-ECB (PKCS#5) with the store's hash key, base64.
 */
export function easypayHash(fields: Record<string, string>, hashKey: string): string {
  const plain = Object.keys(fields)
    .filter((k) => fields[k] !== "" && k !== "merchantHashedReq")
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("&");
  const key = Buffer.from(hashKey, "utf8");
  if (key.length !== 16) throw new ProviderError("Easypaisa hash key must be 16 characters.");
  const c = createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([c.update(plain, "utf8"), c.final()]).toString("base64");
}

const yyyymmdd = (d: Date) => {
  const t = new Date(d.getTime() + 5 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())} ${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`;
};

/** Ask Easypay what happened (needs the merchant's API login). */
async function inquire(ctx: ProviderContext, orderRef: string) {
  const { api_username, api_password, account_number, store_id } = ctx.credentials;
  if (!api_username || !api_password || !account_number) return null;
  const res = await ctx.http.request(
    `${HOSTS[ctx.mode]}/easypay-service/rest/v4/inquire-transaction`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Credentials: Buffer.from(`${api_username}:${api_password}`).toString("base64"),
      },
      body: JSON.stringify({ orderId: orderRef, storeId: store_id, accountNum: account_number }),
    },
  );
  try {
    return JSON.parse(res.text) as {
      responseCode?: string;
      transactionStatus?: string;
      transactionAmount?: number | string;
      transactionId?: string;
    };
  } catch {
    throw new ProviderError(`Easypaisa status check failed (${res.status}).`);
  }
}

/**
 * Easypaisa (Easypay) hosted checkout, two steps: Index.jsf → our return with
 * auth_token → Confirm.jsf → our return with status. The final redirect isn't
 * signed, so payment is only marked paid after a server-side status inquiry.
 * Beta.
 */
export const easypaisa: OnlineProvider = {
  key: "easypaisa",

  async createSession(ctx, req) {
    if (req.currency !== "PKR") throw new ProviderError("Easypaisa accepts PKR only.");
    const { store_id, hash_key } = ctx.credentials;
    if (!store_id || !hash_key) throw new ProviderError("Easypaisa isn't fully set up.");
    const ref = `${req.order_number}-${Date.now().toString(36)}`.slice(0, 40);
    const fields: Record<string, string> = {
      storeId: store_id,
      amount: easypayAmount(req.amount_minor),
      postBackURL: req.return_url,
      orderRefNum: ref,
      expiryDate: yyyymmdd(new Date(Date.now() + 24 * 3600_000)),
      autoRedirect: "1",
      emailAddr: req.email ?? "",
      mobileNum: (req.phone ?? "").replace(/[^\d]/g, "").replace(/^92/, "0"),
      paymentMethod: "",
    };
    fields.merchantHashedReq = easypayHash(fields, hash_key);
    return {
      reference: ref,
      redirect: { method: "POST", url: `${HOSTS[ctx.mode]}/easypay/Index.jsf`, fields },
    };
  },

  async handleReturn(ctx, params) {
    // Step 1 → 2: Easypay hands back an auth token to confirm on its Confirm page.
    if (params.auth_token) {
      return {
        kind: "redirect",
        reference: params.orderRefNumber ?? "",
        redirect: {
          method: "POST",
          url: `${HOSTS[ctx.mode]}/easypay/Confirm.jsf`,
          fields: { auth_token: params.auth_token, postBackURL: params.postBackURL ?? "" },
        },
      };
    }
    const ref = params.orderRefNumber ?? params.orderRefNum ?? "";
    if (!ref) throw new ProviderError("Easypaisa sent no order reference.");
    const status = await inquire(ctx, ref);
    if (!status)
      return {
        kind: "message",
        message: {
          reference: ref,
          external_id: `${ref}:unverified:${params.status ?? ""}`,
          outcome: "pending",
          reason: "Confirm this payment in the Easypay merchant portal (no API login set up).",
          evidence: { source: "return", status: params.status ?? null, desc: params.desc ?? null },
        },
      };
    const s = (status.transactionStatus ?? "").toUpperCase();
    const outcome =
      s === "PAID" ? "paid" : s === "FAILED" || s === "REVERSED" ? "failed" : "pending";
    return {
      kind: "message",
      message: {
        reference: ref,
        external_id: `${ref}:inquiry:${s}`,
        outcome,
        amount_minor:
          status.transactionAmount !== undefined
            ? fromUnits(Math.round(Number(status.transactionAmount) * 100), "PKR", 2)
            : undefined,
        currency: "PKR",
        charge_id: status.transactionId,
        evidence: { source: "inquiry", status: s, code: status.responseCode ?? null },
      },
    };
  },
};
