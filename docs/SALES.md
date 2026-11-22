# Sales (Discounts → Sales)

A **sale** changes product prices for a while, e.g. 20% off everything for Eid. Unlike a
[discount](DISCOUNTS.md), which is taken off at checkout, a sale writes the new price onto the
products. The old price goes into **compare-at**, so the store shows it struck through
everywhere: product pages, collections, cart and checkout.

It works like WooCommerce's sale price, but for many products at once, and the old prices are
saved so they can be put back.

## Running a sale

**Discounts → Sales → Run a sale**:

1. **Name**, e.g. "Eid Sale" (for you).
2. **Discount**: a percentage, or a fixed amount off each item (store currency).
3. **Products**: all products, some collections, or picked products. Every variant of a
   matching product is included.
4. **Products already on sale** (compare-at above the price):

   | Choice                                     | Rs 5,000 → Rs 4,000 with 20% off  |
   | ------------------------------------------ | --------------------------------- |
   | **Leave them as they are** (default)       | Stays Rs 4,000                    |
   | Take the sale off their original price     | 20% off 5,000 = 4,000: no change  |
   | Take the sale off their current sale price | Rs 3,200, Rs 5,000 struck through |

   "Original price" only changes a product when the result is cheaper than its current price.

5. **Rounding**: none (default), whole amount, ending in 9, multiple of 10 or 100. Sale prices
   always round **down**, so "20% off" is never less than 20% off.
6. **Schedule**: start now or on a date; end on a date, or when you end it.
7. **Review changes** shows how many products and variants change, how many are skipped and why,
   and example prices. Nothing changes until you confirm.

A product is in **one running sale at a time**: products already in another running sale are
skipped (the review says how many). Variants without a price, or where the discount is more than
the price, are skipped too.

## Ending a sale

- **On its end date**: prices go back automatically.
- **End sale now**: on the sale's page, after a confirmation.
- **Remove** one product from a running sale: only that product's price goes back.
- A scheduled sale can be cancelled before it starts (no prices change).

Ending puts back each variant's exact old price and compare-at price. **If you changed a
product's price by hand during the sale, it keeps your new price**, and the sale page lists it
as "Kept your edit". The same happens to a variant whose price changed for any other reason.

A running sale's name and end date can be changed; its discount and products can't (end it and
run a new one). **Add new matching products** includes products created after the sale started.

The product page shows a banner while a product is in a running or scheduled sale.

## Scheduling

Sales start and end:

- as the store is used: any storefront or admin request checks for sales that are due (at most
  every 30 seconds per store), and
- from the cron endpoint `GET /api/v1/internal/cron/sales` (needs `CRON_SECRET`; Vercel Cron
  calls it once a day as a backup — see `DEPLOY-VERCEL.md` §5d).

So a sale set to end at midnight ends with the first visit after midnight. Storefront pages are
refreshed when a sale starts or ends.

## Good to know

- Orders already placed keep the price they were placed at. Carts holding a product show the
  usual "price changed" notice.
- Markets with converted prices follow the sale automatically. Fixed market prices
  (Settings → Markets → product prices) are not changed by a sale.
- Every start, end, cancellation and change is recorded in the audit log (`sale.*`).
- Permission: viewing needs `store.read`; running, changing and ending sales needs
  `discounts.write` (owners and administrators; the same permission now manages discounts).

## Data

- `sales`: name, value, target, already-discounted choice, rounding, dates, status
  (`scheduled` → `running` → `ended`, or `canceled`).
- `sale_items`: per variant, the old price and compare-at, and the sale price and compare-at,
  with a status: `active`, `restored`, `kept` (edited during the sale) or `removed` (variant
  deleted). A partial unique index allows one active item per variant.
- Prices are written in bulk (`UPDATE … FROM (VALUES …)`) and only where the variant still has
  the expected price, which is how edits during a sale are detected.
