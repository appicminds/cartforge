# Markets

Sell to other countries in their own currency from one store: one catalog, one stock count, one
admin. Modelled on Shopify Markets, with two differences that suit Pakistani merchants: fixed
prices per market are first-class, and payment methods are chosen per market explicitly.

## Concepts

- **Primary market**: every store has one, in the store's currency (e.g. "Pakistan", PKR). It is
  created the first time Markets is opened. Leave its countries empty to cover every country no
  other market lists.
- **Market**: a name, a currency and a list of countries (e.g. "Gulf": AED, for AE and SA). A
  country belongs to one market only.
- Stores without other markets behave exactly as before.

## Prices

Products are priced once, in the store currency. In another market the price is:

1. the **fixed price** for that product in that market, if the merchant set one (product page →
   Markets), otherwise
2. the store price × **rate** × (1 + **adjustment %**), then **rounded** up by the market's rule
   (none, whole amount, .99, ending in 9, next 5, next 10).

The rate is either:

| Mode                   | Where it comes from                                     | Notes                                                             |
| ---------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| **Your own rate**      | The merchant enters it: "1 AED = 76 PKR"                | Prices change only when the merchant changes it                   |
| **Live exchange rate** | Open Exchange Rates, refreshed when older than 12 hours | Needs `FX_PROVIDER=openexchangerates` and `FX_API_KEY` on the API |

If a live rate can't be fetched, the last good rate is used for up to a week; after that the
market pauses (shoppers see the primary market) and the admin shows it as paused.

Shipping fees, free-shipping thresholds and order limits are set in the store currency and
converted exactly at the market's rate (no adjustment or price rounding). Tax rates are
percentages and apply unchanged.

## Products per market

A product can be hidden from any market except the primary one (product page → Markets → untick
"Sell in …"). In that market it isn't listed, searched or sold; its page says "Not available in
your region"; a cart switching into that market drops it with a notice.

## Shoppers

- The storefront picks the market from the shopper's choice (footer **Country / region**, stored
  in a cookie), else their location (`x-vercel-ip-country` / `cf-ipcountry`), else the primary
  market.
- Carts are priced in their market. Changing country re-prices the cart (`PUT
/storefront/cart/market`).
- Checkout only offers countries of the market (and of the shipping methods) and the market's
  payment methods. JazzCash, Easypaisa, Raast transfer and Safepay are PKR-only and never offered
  elsewhere.

## Orders and reports

Orders are charged in the market currency and record `market_id`, `fx_rate` (store units per 1
order unit) and `store_total_minor` (the order's value in the store currency). The admin order
page shows "≈ Rs …" for orders in another currency, and customer totals are in the store currency.

## Changing a store's own currency

Before the first order, a platform admin can switch a store's currency keeping the shown numbers
(Platform → Stores → Currency). After orders exist, add a market instead.

## Later

Per-market languages and domains/subfolders, duties and import taxes at checkout, variant-level
availability, price lists shared between markets.
