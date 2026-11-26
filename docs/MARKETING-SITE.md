# Marketing site (`apps/web`)

The public website: what CartForge is, pricing, and the way in ("Start for free").
Inspired by the structure of the big commerce platforms' sites, with CartForge's own
identity, words and pictures. Phase 1 is live; phases 2 and 3 are planned below.

## Pages (phase 1)

| Path                                                      | What's there                                                                                                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                       | Hero with email sign-up; Sell online; Store builder and themes; Payments; Sell internationally; Marketing; Run your business; pricing teaser; final sign-up |
| `/pricing`                                                | Plans with a monthly/yearly switch, comparison table, FAQ                                                                                                   |
| `/legal/terms`, `/legal/privacy`, `/legal/acceptable-use` | Plain-language **drafts**: have them reviewed by a lawyer and add the company's legal name and contact details before launch                                |
| `/sitemap.xml`, `/robots.txt`, `/opengraph-image`         | Search and sharing                                                                                                                                          |

The Features menu points at the home page's sections until phase 2 adds a page for each.

## How it connects to the app

- "Start for free" forms are plain `GET` forms to `NEXT_PUBLIC_APP_URL/signup?email=…`; the
  sign-up page fills the email in (only if it looks like an email).
- "Log in" goes to `NEXT_PUBLIC_APP_URL/login`.

## Content

- **Plans**: `src/lib/plans.ts` (USD prices, features, comparison table, FAQ). `BETA = true`
  shows every plan as free during the beta; set it to `false` when billing starts.
- **Navigation**: `src/lib/site.ts`.
- **Legal text**: `src/lib/legal.ts`.
- **Screenshots**: `public/shots/*.webp` are real screens of the "Noor Studio" demo store (Noor
  theme with its sample products, sample orders, discounts, a sale and markets), taken at
  double resolution (2000–2400 px wide; phones at 780 px). Theme pictures in `public/themes/`
  come from `OUT_DIR=apps/web/public/themes SCALE=2 node scripts/theme-thumbnails.mjs`.
- **UI cards** (`src/components/home/ui-cards.tsx`): small pieces of the admin drawn in code
  (a new order, sales, payments, currencies, a discount, two-step sign-in) so they stay sharp.
  Their numbers are illustrations.
- **Photographs**: `src/lib/photos.ts` lists the photo slots (`founder`, `packing`, `global`).
  Put free-license photos (e.g. Unsplash License) in `public/photos/`, set `src`, `alt` and the
  credit. Until then each slot shows a designed gradient.
- No invented proof: no merchant logos, testimonials or usage numbers until real ones exist.

## Design

Ink (`#111214`) and white bands, CartForge ember (`#c2410c`) for actions, Bricolage Grotesque
for headings (display sizes up to 128 px) and Inter for text (self-hosted by `next/font`).
Tokens are in `src/app/globals.css`. Motion: sections fade up as they scroll into view (CSS
scroll-driven animations, where supported) and UI cards float gently; both are off for
visitors who prefer reduced motion.

## Tests

`pnpm --filter @cartforge/web test:e2e` (after `build`): home, Features menu, pricing switch,
legal pages, 404, sitemap and robots, accessibility (axe, WCAG 2.1 AA) and phone width.

## Next phases

2. A page per feature (store builder, payments, markets, marketing, operations) and a Themes
   page with live demo stores.
3. Blog, About and Contact, analytics, launch checklist (domain, legal review, final prices).
