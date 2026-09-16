# Launch checklist

These are the steps that need your accounts or a browser, in dependency order. Everything that can be done from code is done: the add-on is pushed to the test script, CI runs on every push, the Worker and site configs pass `wrangler deploy --dry-run`, and the store icons are generated.

Every command runs from the repo root unless it says otherwise.

## 1. Test the add-on (now)

The latest code is already in your test Apps Script project.

1. Open the test spreadsheet (its ID is `parentId` in `addon/.clasp.json`) and reload it.
2. Go to **Extensions → Rowvoice → Open Rowvoice**. The permissions changed (`drive` → `drive.file`, plus send mail and openid), so Google asks you to approve them again.
3. Work through the **Test checklist** in `README.md`.
4. **Pro features before licensing exists.** `getPlan_` returns `free` while `LICENSE_API_BASE` is empty. To test emailing, set `EMAIL_IS_PRO_FEATURE = false` in `addon/License.js`, run `cd addon && clasp push`, and **set it back to `true` before release**.

After any code change: `cd addon && clasp push`.

## 2. Domain and Cloudflare

1. ~~Pick a domain and add it to Cloudflare.~~ Done: **rowvoice.com**. Both configs already use it: the license Worker is served at `api.rowvoice.com`, and the site at `rowvoice.com` and `www.rowvoice.com`. Deploying creates the DNS records and certificates.
2. ✅ **Done:** the license Worker is deployed, and https://api.rowvoice.com/health returns `{"ok":true}`. Redeploy after config changes with `cd license-worker && npm run deploy`.
3. ✅ **Done:** the site is live at https://rowvoice.com, www, `/privacy` and `/terms`, with security headers, robots.txt and a sitemap. Until launch, the install buttons are "Notify me" email links. Redeploy with `cd site && npx wrangler deploy`.
4. **Email:** turn on **Cloudflare Email Routing** for rowvoice.com (free) and forward `support@rowvoice.com` to your inbox. The site and legal pages use that address.

## 3. Connect the add-on to the Worker

1. In `addon/License.js`, set `LICENSE_API_BASE = 'https://api.rowvoice.com'`. `appsscript.json` already allows it.
2. Rename the Apps Script project to "Rowvoice" in the script editor (the title is only set there).
3. Push the changes: `cd addon && clasp push`.
4. Open the script editor with `clasp open-script`, then run `debugIdentityToken` and approve it. Copy the logged `aud`.
5. Put the `aud` in `GOOGLE_CLIENT_IDS` in `license-worker/wrangler.jsonc`, then run `npm run deploy` again.
6. Reload the sidebar. The usage box should still say "Free plan", and the Worker logs (`npm run tail`) should show no `Rejected ID token` warnings.

## 4. Stripe (test mode first)

1. Create the **Product** "Rowvoice Pro" with two recurring prices: **$6/month** and **$49/year**.
2. Create a **Payment Link** for each price. Put them in `UPGRADE_URLS` in `addon/License.js`.
3. Create a **Webhook** endpoint `https://api.rowvoice.com/api/webhook` with these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

   Then run `npx wrangler secret put STRIPE_WEBHOOK_SECRET` from `license-worker/`.
4. **Customer portal:** allow cancellation and switching between the two prices.
5. **Restricted API key** with Customer portal: Write. Run `npx wrangler secret put STRIPE_SECRET_KEY`.
6. `PORTAL_RETURN_URL` is already `https://rowvoice.com/`. Run `npm run deploy` and `cd ../addon && clasp push`.
7. **End to end:**
   1. Click "Pro $6/mo" in the sidebar and pay with card `4242 4242 4242 4242`.
   2. Click "Already upgraded? Refresh". The sidebar should show Pro.
   3. Create an invoice and check it has no footer.
   4. Email it.
   5. Open "Manage billing" and cancel.

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

1. Repeat step 4 in Stripe **live mode**: new prices and Payment Links, a new webhook signing secret and a live restricted key.
2. Update `UPGRADE_URLS`, then run `wrangler secret put` for both secrets.
3. Deploy the Worker and run `clasp push`.
4. Make one real purchase and refund it.

To regenerate the store images after a logo change: `node docs/store-assets/render.mjs`.
