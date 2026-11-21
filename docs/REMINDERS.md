# Reminders

Things decided for later. Tick them off as they're done.

## Setup on the live site (product owner)

- [ ] **Live exchange rates for Markets** — create a free App ID at openexchangerates.org, set
      `FX_PROVIDER=openexchangerates` and `FX_API_KEY` on `cartforge-api`, redeploy
      (`DEPLOY-VERCEL.md` §5c). Until then markets use rates typed in by the merchant.
- [ ] **Email** — `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_URL`
      (`DEPLOY-VERCEL.md` §5b). Without it no order emails or reset links are sent.
- [ ] **Public sign-up** — `CARTFORGE_EDITION=saas` if merchants should sign up themselves.
- [ ] **Rotate secrets shared in chat** — Neon database password, Upstash token, `SEED_PASSWORD`.
- [ ] **Payment sandboxes** — one test payment each with JazzCash, Easypaisa and Safepay sandbox
      credentials before going live (`PAYMENTS.md`).

## silsilastudio

- [ ] Shipping option for Pakistan (Settings → Checkout) — fix or replace "Standard", which
      currently matches no address.
- [ ] Turn on a payment method (Settings → Payments → Cash on delivery).
