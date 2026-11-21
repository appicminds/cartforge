/** Re-exported so client components don't import server modules. */
export type {
  CartLineView,
  CartNotice,
  CartView,
  CheckoutView,
  CommerceAddress,
  FieldError,
  OrderConfirmation,
  OrderListItem,
  StorefrontCustomer,
  CustomerAddressView,
  PaymentOption,
  PaymentRedirect,
  PlacedOrder,
  ShippingOption,
} from "@cartforge/types";

/** Mirrors the API's PATCH /storefront/checkout body. */
export interface CheckoutUpdateInput {
  email?: string;
  phone?: string | null;
  shipping_address?: AddressInput;
  billing_same_as_shipping?: boolean;
  billing_address?: AddressInput | null;
  shipping_method_id?: string | null;
  payment_method?: string | null;
  custom_fields?: Record<string, string | boolean>;
  terms_accepted?: boolean;
  /** A discount code; null removes it. */
  discount_code?: string | null;
}

export interface AddressInput {
  first_name?: string | null;
  last_name: string;
  company?: string | null;
  address1: string;
  address2?: string | null;
  city: string;
  region?: string | null;
  postal_code?: string | null;
  country: string;
  phone?: string | null;
}

export interface FormState {
  message?: string;
  /** The action succeeded and the message is a confirmation, not an error. */
  done?: boolean;
  /** Field path → message (e.g. "shipping_address.city"). */
  errors?: Record<string, string>;
}
