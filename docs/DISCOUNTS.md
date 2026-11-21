# Discounts (Next 8)

Codes customers type at checkout and discounts that apply by themselves — modelled on Shopify.

## Kinds

| Kind                    | Example                         | How it's worked out                                                       |
| ----------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| **Amount off order**    | 10% off orders over Rs 5,000    | % or fixed amount off the items (after any product discount)              |
| **Amount off products** | 20% off the Lawn collection     | % off each eligible line, or a fixed amount off each eligible item        |
| **Buy X get Y**         | Buy 2 suits, get a dupatta free | The cheapest eligible "get" items, % off or free; optional uses per order |
| **Free shipping**       | Free delivery over Rs 3,000     | The chosen shipping charge                                                |

To change the prices themselves for a while (struck-through old price everywhere, put back
when it ends), use a **sale** instead: see [SALES.md](SALES.md).

Each discount is a **code** (EID20 — typed by the customer) or **automatic** (applies on its
own, shown with its title).

## Options

- **Minimum purchase**: an amount or a number of items (for product and buy X get Y discounts,
  counted on the eligible items).
- **Usage**: a total limit, and/or once per customer (by email). Uses are counted when the order
  is placed; the rows are locked, so a limit of 100 is never exceeded by orders racing each other.
- **Combinations**: a discount marked "combines" can apply together with other combinable ones —
  at most one item discount (products / buy X get Y), one order discount and one free shipping.
  Otherwise checkout uses the single best discount for the customer. On a tie, the code the
  customer typed wins.
- **Markets**: all markets, or specific ones. Fixed amounts and minimums are set in the store
  currency and converted to each market's currency at its rate.
- **Active dates**: start and optional end. Status shows Active, Scheduled, Expired, Used up or
  Off (switched off by the merchant).

## At checkout

- The customer enters a code in the order summary. Invalid, expired, not-yet-active, used-up,
  wrong-market and already-used codes are refused with that reason.
- A valid code that doesn't save anything yet stays on the checkout with a hint: "Spend Rs 1,000
  more to use EID10", "Add 1 more item", "applies once you choose shipping", or "A better
  discount is already applied".
- The summary lists each discount; free shipping shows the shipping price and a matching
  "Free shipping" line.

## On orders

Orders keep the discounts applied (`orders.discounts`), each line keeps its share
(`order_items.discount_minor`, used for refunds and tax), and each use is recorded in
`discount_redemptions`. Deleting a discount doesn't change past orders.

## Permissions

Viewing needs store access; creating and editing need the store-settings permission (owners and
administrators). A dedicated "discounts" permission can be added with the next roles update.

## Later

Customer segments ("first order only", specific customers), discount codes in bulk, BOGO across
variants of the same product with different prices, discounts in the cart page before checkout,
sales reports per discount.
