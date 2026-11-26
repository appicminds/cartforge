import {
  Box,
  CreditCard,
  Globe2,
  Megaphone,
  Settings2,
  Store,
  type LucideIcon,
} from "lucide-react";
import type { FeatureLink } from "@/lib/site/site";

export const FEATURE_ICONS: Record<FeatureLink["icon"], LucideIcon> = {
  store: Store,
  box: Box,
  card: CreditCard,
  globe: Globe2,
  megaphone: Megaphone,
  settings: Settings2,
};
