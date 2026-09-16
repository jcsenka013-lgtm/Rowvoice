# Rowvoice license Worker

Cloudflare Worker + KV that tells the add-on whether a Google account is on Pro, counts free-plan usage, opens the Stripe billing portal, and keeps KV in sync with Stripe.

| Route | Purpose |
| --- | --- |
| `GET /api/check-license` | → `{ plan: "pro" \| "free", status, currentPeriodEnd, cancelAtPeriodEnd, usage: { month, used } }` |
| `POST /api/usage` | Counts one invoice for this account and month → `{ month, used }` |
| `POST /api/portal` | → `{ url }`, a one-time Stripe customer portal session |
| `POST /api/webhook` | Stripe webhook (signature-verified) |
| `GET /health` | Liveness |

Every `/api` route except the webhook needs `Authorization: Bearer <Google ID token>`.

## Design notes

- **No `?email=` lookups.** The add-on sends `ScriptApp.getIdentityToken()`. The Worker verifies it against Google's JWKS (RS256, issuer, audience, expiry, `email_verified`), so nobody can check whether an arbitrary address is a paying customer, and nobody can claim someone else's plan.
- **Purchases are tied to the Google account, not the billing email.** The add-on adds `client_reference_id=<base64url(google email)>` and `prefilled_email` to the Payment Link. The webhook uses the reference first and falls back to the checkout email.
- **Out-of-order events are safe.** Each license stores the `created` time of the Stripe event that last wrote it, and older events are ignored. Ending an old subscription doesn't revoke a newer active one.
- `active`, `trialing` and `past_due` count as Pro. `past_due` is the grace period while Stripe retries the card.
- **The free limit is also counted on the server.** The add-on counts locally too and uses the higher number, so clearing script data doesn't reset the limit. KV has no atomic increment, so two invoices finishing at the same instant could count once. That's fine for a soft limit. Move the counter to a Durable Object if exact counts ever matter.
- There are no dependencies at runtime, and the tests run with plain `node --test`.

KV layout:

- `license:<email>` → JSON license
- `customer:<stripe customer id>` → email
- `usage:<email>:<YYYY-MM>` → count, which expires after 62 days

## Setup

```sh
cd license-worker
npm install
npx wrangler login
npx wrangler kv namespace create LICENSES      # paste the id into wrangler.jsonc
npx wrangler secret put STRIPE_WEBHOOK_SECRET   # from the Stripe webhook endpoint
npx wrangler secret put STRIPE_SECRET_KEY       # restricted key with "Customer portal: Write"
npm run deploy                                  # also creates the api.rowvoice.com DNS record + certificate
```

1. **GOOGLE_CLIENT_IDS**: in the Apps Script editor, run `debugIdentityToken()`. Put the logged `aud` into `vars.GOOGLE_CLIENT_IDS` in `wrangler.jsonc`, then redeploy. If you later link the script to a standard GCP project (Phase 4), the audience changes. Add the new ID next to the old one, separated by a comma.
2. **Stripe**:
   - Create a "Rowvoice Pro" product with two recurring prices: $6/month and $49/year.
   - Create one Payment Link per price.
   - Add a webhook endpoint `https://api.rowvoice.com/api/webhook` with these events:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - Configure the customer portal (Settings → Billing → Customer portal) to allow cancellation and switching between the two prices.
   - `PORTAL_RETURN_URL` in `wrangler.jsonc` is already `https://rowvoice.com/`.
3. **Add-on**:
   - In `addon/License.js`, set `LICENSE_API_BASE` to `https://api.rowvoice.com` and set `UPGRADE_URLS`. `urlFetchWhitelist` in `appsscript.json` already allows it.

## Local testing

```sh
npm test                                              # unit tests
cp .dev.vars.example .dev.vars && npm run dev         # http://localhost:8787
stripe listen --forward-to localhost:8787/api/webhook # use the whsec it prints in .dev.vars
stripe trigger checkout.session.completed
```
