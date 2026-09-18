# Launch checklist

These are the steps that need your accounts or a browser, in dependency order. Everything that can be done from code is done: the add-on is pushed to the test script, CI runs on every push, the Worker and site configs pass `wrangler deploy --dry-run`, and the store icons are generated.

Every command runs from the repo root unless it says otherwise.

> **Where things stand (2026-09-18):** steps 1–4 are done, and the business paperwork is in progress (see `docs/BUSINESS_SETUP.md`). Legal pages are complete, a support page is live, and the Marketplace beta deployment exists. **Next: `docs/VERIFICATION_KIT.md`**, which covers Search Console, the GCP project, the consent screen, the demo video, screenshots and the Marketplace SDK, with every value filled in.

## 1. Test the add-on (now)

The latest code is already in your test Apps Script project.

1. Open the test spreadsheet (its ID is `parentId` in `addon/.clasp.json`) and reload it.
2. Go to **Extensions → Rowvoice → Open Rowvoice**. The permissions changed (`drive` → `drive.file`, plus send mail and openid), so Google asks you to approve them again.
3. Work through the **Test checklist** in `README.md`.
4. To try Pro features, upgrade with a Stripe test card (see step 4). No code changes needed.

After any code change: `cd addon && clasp push`.

## 2. Domain and Cloudflare

1. ~~Pick a domain and add it to Cloudflare.~~ Done: **rowvoice.com**. Both configs already use it: the license Worker is served at `api.rowvoice.com`, and the site at `rowvoice.com` and `www.rowvoice.com`. Deploying creates the DNS records and certificates.
2. ✅ **Done:** the license Worker is deployed, and https://api.rowvoice.com/health returns `{"ok":true}`. Redeploy after config changes with `cd license-worker && npm run deploy`.
3. ✅ **Done:** the site is live at https://rowvoice.com, www, `/privacy` and `/terms`, with security headers, robots.txt and a sitemap. Until launch, the install buttons are "Notify me" email links. Redeploy with `cd site && npx wrangler deploy`.
4. ✅ **Email:** Email Routing is on (MX, SPF and DKIM records added), and `support@rowvoice.com` forwards to your Gmail. **You:** click the verification link Cloudflare emailed to that Gmail address, or forwarding stays paused. It lives in the dashboard under **Compute & AI → Email Service → Email Routing**, or run `npx wrangler email routing rules list rowvoice.com`.

## 3. Connect the add-on to the Worker

✅ **Done.** The add-on calls `https://api.rowvoice.com`, and the add-on's Google client ID is in `GOOGLE_CLIENT_IDS`.
- **Optional:** rename the Apps Script project to "Rowvoice" in the script editor. Users never see the title.
- **If the client ID ever changes** (it will when you link a standard GCP project in step 6):
  1. Open the sidebar once.
  2. Run `cd license-worker && npx wrangler kv key get --binding LICENSES --remote setup:unrecognized-audience`.
  3. Add the value to `GOOGLE_CLIENT_IDS`, separated by a comma.
  4. Run `npm run deploy`.

## 4. Stripe (test mode first)

✅ **Done in test mode** by `license-worker/scripts/stripe-setup.mjs`, using the test key from `.env`:
- "Rowvoice Pro" product with $6/month and $49/year prices, and one Payment Link for each (in `UPGRADE_URLS`)
- A webhook to `https://api.rowvoice.com/api/webhook`. Delivery was verified with a throwaway subscription, which was then deleted.
- A customer portal configuration (`PORTAL_CONFIGURATION_ID`) with cancel at period end, switching between monthly and yearly, and invoice history
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` stored as Worker secrets

**You: test it end to end**
1. Reload the spreadsheet and open the Rowvoice sidebar. Click **Pro $6/mo** and pay with card `4242 4242 4242 4242`, any future date and any CVC.
2. Back in the sidebar, click **Already upgraded? Refresh**. It should say **Pro plan**.
3. Create an invoice and check it has no "Made with Rowvoice" footer. Tick **Email each invoice** and check the email arrives.
4. Click **Manage billing**. The Stripe portal should open. Cancel there, and the subscription ends at the period end.

## 5. Legal and site

1. Replace every placeholder:
   ```sh
   grep -rn "todo" site/public
   ```
   You need a legal name, postal address, contact email, refund policy and governing law.
2. Have a lawyer review `privacy.html` and `terms.html`.
3. Verify the domain in [Google Search Console](https://search.google.com/search-console), using the Google account that will own the GCP project.

## 6. Google verification

Follow `docs/PUBLISHING.md` sections 1–3:

1. Create a standard GCP project and link it to the script. **The ID token audience changes**, so add the new `aud` to `GOOGLE_CLIENT_IDS`.
2. Fill in the OAuth consent screen. The logo is `docs/store-assets/oauth-logo-120.png`, and the scope justifications are in the guide.
3. Record the demo video, then submit for verification.

## 7. Marketplace

1. Set up the Marketplace SDK app configuration and store listing, using the copy in `docs/PUBLISHING.md`. The images are in `docs/store-assets/`:
   - `icon-32.png`, `icon-48.png`, `icon-96.png`, `icon-128.png`
   - `card-banner-220x140.png`
2. Take 3 screenshots at 1280×800 from the real add-on in a tidy demo spreadsheet.
3. Publish **Unlisted**. Test with 3–5 people, on both Gmail and Workspace accounts.
4. After verification is approved:
   - Switch the listing to **Public**.
   - Set `MARKETPLACE_URL` in `site/public/site.js`, then redeploy the site.

## 8. Go live with payments

Fastest path: run `STRIPE_API_KEY=<live secret key> node scripts/stripe-setup.mjs` from `license-worker/`. It creates the live product, links, webhook and portal, and stores both secrets. Then put the printed links in `UPGRADE_URLS` and the portal ID in `PORTAL_CONFIGURATION_ID`, deploy the Worker, and run `clasp push`.


1. Repeat step 4 in Stripe **live mode**: new prices and Payment Links, a new webhook signing secret and a live restricted key.
2. Update `UPGRADE_URLS`, then run `wrangler secret put` for both secrets.
3. Deploy the Worker and run `clasp push`.
4. Make one real purchase and refund it.

To regenerate the store images after a logo change: `node docs/store-assets/render.mjs`.
