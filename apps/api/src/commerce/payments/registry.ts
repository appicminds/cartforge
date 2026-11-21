import type { OnlineProviderKey } from "@cartforge/types";
import type { OnlineProvider } from "./provider";
import { easypaisa } from "./providers/easypaisa";
import { jazzcash } from "./providers/jazzcash";
import { safepay } from "./providers/safepay";
import { stripe } from "./providers/stripe";

export const ONLINE_PROVIDERS: Record<OnlineProviderKey, OnlineProvider> = {
  stripe,
  safepay,
  jazzcash,
  easypaisa,
};

export const isOnlineProvider = (key: string | null | undefined): key is OnlineProviderKey =>
  !!key && key in ONLINE_PROVIDERS;
