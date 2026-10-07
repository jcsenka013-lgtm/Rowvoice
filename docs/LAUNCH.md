# Launch checklist

Steps that need a browser or a logged-in account, in dependency order. Commands run from the repo root unless a step says otherwise.

The marketing site can be live while the Google Workspace Marketplace listing is still private. Do not describe the listing as public, or OAuth verification as complete, until both are actually done.

Real Apps Script IDs, spreadsheet IDs, and account emails belong in a local `docs/OPERATOR_NOTES.md` (gitignored). Start from `docs/OPERATOR_NOTES.md.example`. Do not put them in this file.

## 1. Test the add-on

1. Open the test spreadsheet (the `parentId` in your local `addon/.clasp.json`) and reload it.
2. Go to **Extensions → Rowvoice → Open Rowvoice** and approve the permissions.
3. Work through the **Test checklist** in `README.md`.
4. To try Pro features, upgrade with a Stripe test card (see step 4).

After any add-on change: `cd addon && clasp push`.

## 2. Domain and Cloudflare

1. Add the domain to the Cloudflare account that owns the project. Both configs already use **rowvoice.com**: the license Worker at `api.rowvoice.com`, and the site at `rowvoice.com` and `www.rowvoice.com`.
2. Deploy the license Worker with `cd license-worker && npm run deploy`. `https://api.rowvoice.com/health` should return `{"ok":true}`.
3. Deploy the site with `cd site && npx wrangler deploy`. Until the Marketplace listing is public, install buttons stay "Notify me" links (`MARKETPLACE_URL` in `site/public/site.js`).
4. Turn on Email Routing so `support@rowvoice.com` reaches an inbox you control.

Wrangler configs pin `account_id` so a deploy while logged into another Cloudflare account fails instead of creating a second project.

## 3. Connect the add-on to the Worker

The add-on calls `https://api.rowvoice.com`. The Worker's `GOOGLE_CLIENT_IDS` must include the add-on's OAuth client ID (the ID token audience).

If the client ID changes (for example after linking a standard Google Cloud project):

1. Open the sidebar once.
2. Run `cd license-worker && npx wrangler kv key get --binding LICENSES --remote setup:unrecognized-audience`.
3. Add the value to `GOOGLE_CLIENT_IDS`, separated by a comma.
4. Run `npm run deploy`.

## 4. Stripe (test mode first)

`license-worker/scripts/stripe-setup.mjs` can create the test-mode product, Payment Links, webhook, and customer portal. Pass the key in the environment. Do not commit it.

```sh
cd license-worker
STRIPE_API_KEY=<test secret key from the Stripe dashboard> node scripts/stripe-setup.mjs
```

Store Worker secrets with Wrangler, not in git:

```sh
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

Then check the flow:

1. In the sidebar, click **Pro $6/mo** and pay with Stripe's test card `4242 4242 4242 4242`, any future date, and any CVC.
2. Click **Already upgraded? Refresh**. It should say **Pro plan**.
3. Create an invoice and confirm it has no "Made with Rowvoice" footer.
4. Click **Manage billing** and confirm the Stripe portal opens.

## 5. Legal and site

The public pages name CAPTURES BY JC LLC, Oklahoma law, the refund policy, and `support@rowvoice.com`. Have a lawyer review `site/public/privacy.html` and `site/public/terms.html` before you rely on them. Verify the domain in [Google Search Console](https://search.google.com/search-console) with the Google account that owns the Cloud project.

## 6. Google verification

Follow `docs/PUBLISHING.md` and `docs/VERIFICATION_KIT.md`.

1. Create a standard Cloud project and link it to the script. The ID token audience changes, so add the new client ID to `GOOGLE_CLIENT_IDS`.
2. Fill in the OAuth consent screen. The logo is `docs/store-assets/oauth-logo-120.png`.
3. Record a demo video for Google's review and upload it as **Unlisted**. Do not use that URL on the website or in the README.
4. Submit the consent screen. Verification is not complete until Google says so.

## 7. Marketplace

The listing is not public yet.

1. Set up the Marketplace SDK app configuration and store listing, using the copy in `docs/PUBLISHING.md`. Icons and the card banner are in `docs/store-assets/`.
2. Take screenshots from the real add-on. Do not commit customer data.
3. Publish **Unlisted** first and test with a few Gmail and Workspace accounts.
4. After verification is approved, switch the listing to **Public**, set `MARKETPLACE_URL` in `site/public/site.js`, and redeploy the site.

## 8. Go live with payments

Repeat the Stripe setup in **live mode** only when you intend to charge customers. Use a live restricted key and a new webhook signing secret. Put the printed Payment Links in `UPGRADE_URLS` (`addon/License.js`) and the portal configuration ID in `PORTAL_CONFIGURATION_ID` (`license-worker/wrangler.jsonc`). Store both secrets with `wrangler secret put`, deploy the Worker, and run `clasp push`.

Make one real purchase and refund it.

To regenerate the store images after a logo change: `node docs/store-assets/render.mjs`.

## New machine

1. Install Node.js 22 and Git, then run `npm i -g @google/clasp`.
2. Clone this repository and run `npm test`.
3. Copy `addon/.clasp.json.example` to `addon/.clasp.json` and set `scriptId` to `YOUR_SCRIPT_ID` and `parentId` to `YOUR_SPREADSHEET_ID`.
4. Run `clasp login`, then `cd license-worker && npm install && npx wrangler login` with the Cloudflare account that owns rowvoice.com.
5. Stripe keys are not in git. Copy them from the Stripe dashboard into a local `.env` only if you need to rerun `stripe-setup.mjs`. `.env` and `.dev.vars` are gitignored.
