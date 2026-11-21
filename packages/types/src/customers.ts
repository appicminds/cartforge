/** Customers (Next 7). */
import type { CommerceAddress, OrderListItem } from "./commerce.js";

export const CUSTOMER_ERROR_CODES = {
  CUSTOMER_NOT_FOUND: "CUSTOMER_NOT_FOUND",
  ACCOUNT_EXISTS: "CUSTOMER_ACCOUNT_EXISTS",
  INVALID_LOGIN: "CUSTOMER_INVALID_LOGIN",
  LINK_INVALID: "CUSTOMER_LINK_INVALID",
} as const;

export interface CustomerListItem {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  /** Has a storefront account (can sign in), not only guest orders. */
  has_account: boolean;
  accepts_marketing: boolean;
  tags: string[];
  orders_count: number;
  /** Paid minus refunded, excluding canceled orders, in the store currency. */
  total_spent_minor: number;
  currency: string;
  last_order_at: string | null;
  created_at: string;
}

export interface CustomerAddressView {
  id: string;
  address: CommerceAddress;
  is_default: boolean;
}

export interface CustomerDetail extends CustomerListItem {
  first_name: string | null;
  last_name: string | null;
  note: string | null;
  addresses: CustomerAddressView[];
  orders: OrderListItem[];
}

/** The signed-in shopper, as the storefront sees them. */
export interface StorefrontCustomer {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  accepts_marketing: boolean;
  addresses: CustomerAddressView[];
}
