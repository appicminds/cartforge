/** Cart, checkout and order contracts (Next 4). Money is integer minor units. */

export const COMMERCE_ERROR_CODES = {
  CART_NOT_FOUND: "CART_NOT_FOUND",
  CART_EMPTY: "CART_EMPTY",
  CART_LINE_NOT_FOUND: "CART_LINE_NOT_FOUND",
  ITEM_UNAVAILABLE: "ITEM_UNAVAILABLE",
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  CHECKOUT_NOT_READY: "CHECKOUT_NOT_READY",
  CHECKOUT_CHANGED: "CHECKOUT_CHANGED",
  CHECKOUT_COMPLETED: "CHECKOUT_COMPLETED",
  SHIPPING_UNAVAILABLE: "SHIPPING_UNAVAILABLE",
  PAYMENT_METHOD_UNAVAILABLE: "PAYMENT_METHOD_UNAVAILABLE",
  IDEMPOTENCY_KEY_REQUIRED: "IDEMPOTENCY_KEY_REQUIRED",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
  REQUEST_IN_PROGRESS: "REQUEST_IN_PROGRESS",
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  ORDER_STATE: "ORDER_STATE",
  ORDER_PAID: "ORDER_PAID",
  QUANTITY_TOO_HIGH: "QUANTITY_TOO_HIGH",
  REFUND_TOO_HIGH: "REFUND_TOO_HIGH",
  SHIPPING_METHOD_NOT_FOUND: "SHIPPING_METHOD_NOT_FOUND",
} as const;

export const COMMERCE_HEADERS = {
  CART_TOKEN: "x-cart-token",
  ORDER_KEY: "x-order-key",
  IDEMPOTENCY_KEY: "idempotency-key",
} as const;

export interface CommerceAddress {
  first_name: string | null;
  last_name: string;
  company: string | null;
  address1: string;
  address2: string | null;
  city: string;
  region: string | null;
  postal_code: string | null;
  country: string;
  phone: string | null;
}

export type CartNoticeKind =
  | "price_changed"
  | "quantity_reduced"
  | "removed_unavailable"
  | "sold_out";

export interface CartNotice {
  kind: CartNoticeKind;
  line_id: string | null;
  title: string;
  message: string;
}

export interface CartLineView {
  id: string;
  variant_id: string;
  product_id: string;
  product_handle: string;
  product_title: string;
  /** "" for simple products. */
  variant_title: string;
  options: { option: string; value: string }[];
  image: { url: string; alt: string | null } | null;
  quantity: number;
  unit_price_minor: number;
  compare_at_minor: number | null;
  line_total_minor: number;
  requires_shipping: boolean;
  /** False when the line can't be bought right now (sold out with tracking). */
  available: boolean;
  /** Most that can be bought; null = no limit. */
  max_quantity: number | null;
}

export interface CartView {
  id: string;
  currency: string;
  lines: CartLineView[];
  item_count: number;
  subtotal_minor: number;
  requires_shipping: boolean;
  /** Changes since the shopper last looked (price changes, removals, reductions). */
  notices: CartNotice[];
  /** Every line is purchasable. */
  ready: boolean;
}

export interface ShippingOption {
  id: string;
  name: string;
  description: string | null;
  price_minor: number;
  free: boolean;
  estimate: { min_days: number | null; max_days: number | null } | null;
}

export interface PaymentOption {
  key: string;
  label: string;
  description: string;
}

export interface CheckoutCustomField {
  key: string;
  label: string;
  type: "text" | "textarea" | "checkbox" | "select";
  required: boolean;
  options: string[];
  help: string;
}

export interface CheckoutTotals {
  subtotal_minor: number;
  discount_minor: number;
  shipping_minor: number | null;
  tax_minor: number;
  total_minor: number;
  prices_include_tax: boolean;
  tax_label: string;
  tax_rate_bps: number;
}

export interface CheckoutView {
  id: string;
  cart: CartView;
  email: string | null;
  phone: string | null;
  phone_mode: "hidden" | "optional" | "required";
  shipping_address: CommerceAddress | null;
  billing_same_as_shipping: boolean;
  billing_address: CommerceAddress | null;
  shipping_required: boolean;
  /** Countries that can be shipped to; null = anywhere. */
  shipping_countries: string[] | null;
  shipping_options: ShippingOption[];
  shipping_method_id: string | null;
  payment_options: PaymentOption[];
  payment_method: string | null;
  custom_fields: CheckoutCustomField[];
  custom_field_values: Record<string, string | boolean>;
  terms: { required: boolean; label: string; url: string } | null;
  terms_accepted: boolean;
  totals: CheckoutTotals;
  reserved_until: string | null;
  /** What's still missing before the order can be placed. */
  missing: string[];
}

export interface PlacedOrder {
  order_id: string;
  number: string;
  /** Secret for the order-status page; shown once. */
  access_key: string;
  total_minor: number;
  currency: string;
  /** True when the shopper pays on a provider's page next (POST /storefront/orders/:id/payment). */
  pay_online: boolean;
}

export type OrderStatus =
  | "pending"
  | "processing"
  | "on_hold"
  | "completed"
  | "canceled"
  | "refunded";
export type PaymentStatus =
  | "pending"
  | "authorized"
  | "paid"
  | "partially_refunded"
  | "refunded"
  | "voided"
  | "failed";
export type FulfillmentStatus = "unfulfilled" | "partially_fulfilled" | "fulfilled";

export interface OrderLineView {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  product_title: string;
  variant_title: string;
  sku: string | null;
  options: { option: string; value: string }[];
  quantity: number;
  unit_price_minor: number;
  discount_minor: number;
  tax_minor: number;
  line_total_minor: number;
}

/** A shipment, as the customer sees it. */
export interface FulfillmentView {
  id: string;
  tracking_company: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string;
  delivered_at: string | null;
  items: { order_item_id: string; title: string; quantity: number }[];
}

/** What the customer sees on their order-status page. */
export interface OrderConfirmation {
  id: string;
  number: string;
  placed_at: string;
  currency: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  email: string | null;
  shipping_address: CommerceAddress | null;
  billing_address: CommerceAddress | null;
  shipping_method: { name: string; price_minor: number } | null;
  payment: {
    method: string;
    label: string;
    instructions: string | null;
    /** Paid on a provider's page (Next 5). */
    online: boolean;
    /** Online and still unpaid: the shopper can (re)try paying. */
    can_pay: boolean;
    /** Why the last online attempt didn't go through. */
    failure_reason: string | null;
  } | null;
  lines: OrderLineView[];
  fulfillments: FulfillmentView[];
  canceled_at: string | null;
  /** Money given back so far. */
  refunded_minor: number;
  totals: {
    subtotal_minor: number;
    discount_minor: number;
    shipping_minor: number;
    tax_minor: number;
    total_minor: number;
    prices_include_tax: boolean;
    tax_label: string;
  };
}

export interface OrderListItem {
  id: string;
  number: string;
  placed_at: string;
  email: string | null;
  customer_name: string | null;
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  item_count: number;
  total_minor: number;
  currency: string;
}

export interface OrderEventView {
  id: string;
  type: string;
  message: string;
  at: string;
  /** Staff member's name, for actions and notes; null for the system or the customer. */
  actor: string | null;
}

export interface RefundView {
  id: string;
  amount_minor: number;
  reason: string | null;
  created_at: string;
  created_by: string | null;
  items: { order_item_id: string; title: string; quantity: number; restocked: boolean }[];
}

export const CANCEL_REASONS = ["customer", "inventory", "fraud", "declined", "other"] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export interface OrderDetail extends OrderConfirmation {
  phone: string | null;
  custom_fields: { key: string; label: string; value: string | boolean }[];
  terms_accepted_at: string | null;
  source: string;
  cancel_reason: string | null;
  /** Markets: the order's value in the store currency, when it was paid in another. */
  store_value: { currency: string; total_minor: number; rate: number } | null;
  /** Per line: how many were shipped and refunded (for the fulfil/refund dialogs). */
  line_progress: { order_item_id: string; fulfilled: number; refunded: number }[];
  refunds: RefundView[];
  events: OrderEventView[];
  payments: {
    id: string;
    provider: string;
    status: PaymentStatus;
    amount_minor: number;
    created_at: string;
    /** Online providers: "test" or "live", the provider's reference, last failure. */
    mode: string | null;
    provider_reference: string | null;
    failure_reason: string | null;
  }[];
}

export interface ShippingMethodView {
  id: string;
  name: string;
  description: string | null;
  price_minor: number;
  free_over_minor: number | null;
  countries: string[];
  regions: string[];
  cities: string[];
  min_order_minor: number | null;
  max_order_minor: number | null;
  per_item_minor: number;
  min_days: number | null;
  max_days: number | null;
  active: boolean;
  position: number;
}
