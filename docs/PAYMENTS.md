# Payments (Next 5)

How a CartForge store gets paid, with Pakistan in mind. Stripe does not onboard Pakistani
businesses, so Pakistani stores use the local options below.

## The options

| Method                                            | Customers pay with                                     | Confirmation                                          | Fees / contract                        | Status in CartForge              |
| ------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- | -------------------------------------- | -------------------------------- |
| **Wallet / Raast transfer** (Settings → Payments) | JazzCash, Easypaisa, any bank app via Raast ID or IBAN | Merchant clicks **Mark as paid** on the order         | None (no gateway)                      | ✅ Ready                         |
| Bank transfer, cash on delivery                   | Bank transfer, cash                                    | Merchant marks paid                                   | None                                   | ✅ Ready                         |
| **Safepay** (Settings → Payments)                 | Cards, wallets, Raast                                  | Signed redirect (automatic)                           | Safepay merchant agreement             | Beta: verify in Safepay sandbox  |
| **JazzCash** (Settings → Payments)                | JazzCash wallet, cards                                 | Signed return + IPN (automatic)                       | JazzCash merchant account              | Beta: verify in JazzCash sandbox |
| **Easypaisa** (Settings → Payments)               | Easypaisa wallet, cards                                | Server-side status inquiry (automatic with API login) | Easypay merchant account               | Beta: verify in Easypay sandbox  |
| **Stripe** (Settings → Payments)                  | Cards, Apple Pay, Google Pay                           | Signed webhook + session check (automatic)            | Stripe account (not for PK businesses) | ✅ Ready                         |

"Beta" means the adapter is built to the provider's published integration guide and covered by
tests that simulate the provider, but it hasn't been run against that provider's real sandbox yet.
Do one test payment in **test mode** with your sandbox credentials before switching to live.

## Setting up

All payment options are on **Settings → Payments**: online gateways at the top, manual methods
(bank transfer, wallet/Raast transfer, cash on delivery) below. JazzCash, Easypaisa, Safepay and
the wallet/Raast transfer only work for stores that sell in PKR; the page says so for other
currencies. Checkout also needs at least one shipping method (Settings → Checkout) for physical
products.

1. **Settings → Payments → Manual payment methods → JazzCash, Easypaisa or Raast transfer** works
   immediately for stores that sell in PKR (it's switched off for other currencies): enter any of
   your JazzCash number, Easypaisa number, Raast ID or IBAN, plus the account title. Customers see
   exactly where to send the money, with the order number as reference. When it arrives, open the
   order and click **Mark as paid** (add the transaction ID as the reference).
2. **Settings → Payments → Connect** a gateway:
   - Choose **Test (sandbox)** first and enter the sandbox credentials from the provider.
   - Copy the **notification (webhook / IPN) URL** and **return URL** shown in the dialog into the
     provider's merchant portal, so payments are confirmed even if the customer closes the tab.
   - Tick **Offer … at checkout** and place a test order on your storefront.
   - When it works, switch the mode to **Live** and enter the live credentials.

| Provider  | Credentials                                                                      | Register in their portal                                         |
| --------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Safepay   | API key, secret key                                                              | Return URL                                                       |
| JazzCash  | Merchant ID, password, integrity salt                                            | Return URL; IPN URL (notification URL)                           |
| Easypaisa | Store ID, 16-character hash key; optional account number + API username/password | Post-back URL (return URL)                                       |
| Stripe    | Secret key (`sk_test_…` / `sk_live_…`), webhook signing secret (`whsec_…`)       | Webhook endpoint (notification URL), events `checkout.session.*` |

Without the Easypaisa API login, CartForge can't confirm Easypaisa payments by itself (Easypay's
final redirect isn't signed): the order shows "Confirm this payment in the Easypay merchant portal"
and you mark it paid by hand.

## How it works

1. The customer chooses an online method and places the order. Stock is taken and the order is
   saved with a **pending** payment.
2. The storefront asks the API to start a payment and sends the customer to the provider (a
   redirect, or an automatically submitted form for JazzCash/Easypaisa). **Pay now** on the order
   page starts a fresh attempt if the first one fails.
3. The provider confirms in one or both ways:
   - **Return:** the customer comes back to `/checkout/return/<provider>`. The storefront passes
     what the provider sent to the API, which verifies it (signature, or asking the provider).
   - **Notification:** the provider calls the webhook/IPN URL directly. The API checks the
     signature.
4. The API records each verified message once (`payment_events`, append-only). It marks the order
   paid only if the amount and currency match the order. Otherwise it leaves a warning on the
   timeline.

Refunds on Stripe-paid orders go back to the card automatically. For the Pakistani gateways,
refunds are recorded in CartForge and the money is returned from the provider's portal.

**Security:**

- Provider credentials are encrypted with `APP_ENCRYPTION_KEY`. They are never shown again, never
  logged, and only the store owner and administrators can change them.
- Messages that fail verification are rejected and logged.
- No card or wallet data passes through CartForge.

## Before going live (per store)

- [ ] One successful test-mode payment, refund (Stripe) and failed payment per provider
- [ ] Notification/IPN URL registered with the provider
- [ ] Live credentials entered, mode set to **Live**
- [ ] `EMAIL_PROVIDER` configured so customers get their order and payment emails
