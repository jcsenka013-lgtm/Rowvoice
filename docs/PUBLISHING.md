# Publishing to the Google Workspace Marketplace

These are the Phase 4 steps. They're all manual (Google Cloud console and Marketplace SDK), so this is a checklist plus the text you'll paste into the forms.

## 0. Prerequisites

- The site from Phase 3 is deployed on a custom domain, and the domain is verified in [Google Search Console](https://search.google.com/search-console) with the same Google account that owns the GCP project.
- The privacy policy and terms have no placeholders left (`grep -rn "todo" site/public`).
- The license Worker is deployed, and `LICENSE_API_BASE` and `UPGRADE_URLS` are set in `addon/License.js`.
- `urlFetchWhitelist` in `appsscript.json` lists `https://www.googleapis.com/` (Drive) and `https://api.rowvoice.com/` (license Worker). It is **required** for published add-ons that call `UrlFetchApp`.
- The Stripe customer portal is configured, and `STRIPE_SECRET_KEY` and `PORTAL_RETURN_URL` are set on the Worker.

## 1. Standard GCP project

1. Create a project in the [Cloud console](https://console.cloud.google.com/), e.g. `rowvoice-prod`.
2. Copy the **project number**, not the project ID.
3. In the Apps Script editor, go to **Project Settings → Google Cloud Platform (GCP) Project → Change project** and paste the number.
4. The OAuth client, and so the ID token audience, changes. Re-run `debugIdentityToken()` and add the new `aud` to `GOOGLE_CLIENT_IDS` in the Worker. Keep the old value until everyone is on the new deployment.

## 2. OAuth consent screen

| Field | Value |
| --- | --- |
| User type | External |
| App name | Rowvoice |
| Support email | the support address used on the site |
| App logo | 120×120 PNG: `docs/store-assets/oauth-logo-120.png` |
| App domain / homepage | `https://rowvoice.com/` |
| Privacy policy | `https://rowvoice.com/privacy` |
| Terms of service | `https://rowvoice.com/terms` |
| Authorized domains | `rowvoice.com` |

Scopes. These must match `addon/appsscript.json` exactly. Use these justifications:

| Scope | Justification |
| --- | --- |
| `spreadsheets.currentonly` | Reads the header row and the rows the user selects in the spreadsheet where they opened the add-on, and writes the invoice number, status and PDF link back to those rows. |
| `drive.file` | Creates a "Rowvoice" folder, saves generated invoice PDFs and the user's uploaded logo, and reads back only those app-created files. Has no access to any other Drive content. |
| `script.container.ui` | Shows the add-on sidebar and the invoice preview dialog inside Google Sheets. |
| `script.external_request` | Makes one HTTPS call to our license server to check whether the user has a Pro subscription. No spreadsheet data is sent. |
| `script.send_mail` | Pro users can email an invoice PDF to the client listed in the row, from their own account, only when they click Create with "Email each invoice" ticked or click "Email selected". The add-on cannot read mail. |
| `userinfo.email`, `openid` | Identifies the signed-in Google account to the license server with a Google-signed ID token, so a subscription is tied to the account that paid for it. |

Verification notes:

- **None of these scopes are restricted, so no CASA security assessment is needed.** Check each scope's current class (sensitive or non-sensitive) in the consent screen UI. The prototype requested the full `drive` scope, which *is* restricted. It was replaced with `drive.file` before publishing, and must not be re-added.
- Google asks for a **demo video** (unlisted YouTube). Record about 2 minutes that shows:
  - The consent screen, with every scope visible
  - Inserting the starter sheet and creating an invoice
  - The PDF in Drive and the write-back to the sheet
  - The preview dialog
  - The upgrade link
  - Emailing an invoice, and the email arriving with the PDF attached

## 3. Deploy a version

1. From the `addon/` folder, run `clasp push`, then `clasp version "v1.0.0"`.
2. In the Apps Script editor, go to **Deploy → New deployment → Add-on** and note the **deployment ID**.

## 4. Marketplace SDK

1. Enable the **Google Workspace Marketplace SDK** in the GCP project.
2. **App configuration**:
   - Visibility: start as **Private/Unlisted** for beta.
   - Integration: **Sheets add-on**.
   - Enter the Apps Script **deployment ID** and **version**.
   - Paste the **same scopes** as the manifest.
   - Add developer links (site, privacy, terms, support).
3. **Store listing**:
   - Application name: Rowvoice
   - Short description (≤ 80 chars): `Turn Google Sheets rows into branded PDF invoices saved to your Drive.`
   - Detailed description:

     > Select a row in Google Sheets, click Create, and Rowvoice makes a branded PDF invoice in your Google Drive. It writes the invoice number, status and PDF link back to your sheet.
     >
     > • Works with the sheet you already have. It finds your header row and matches columns like Client, Total and Due date automatically.
     > • Starting from scratch? Insert a ready-made invoice sheet in one click.
     > • Multiple line items per invoice, your logo, payment instructions and any currency.
     > • Preview the invoice before creating it.
     > • Create up to 25 invoices at once. Numbers are sequential and never duplicated.
     > • Private by design: it can only open the spreadsheet you use it in and the files it creates.
     >
     > Free: 5 invoices a month. Pro: unlimited invoices and no footer, $6/month or $49/year.

   - Category: Business tools / Accounting & finance
   - Pricing: **Free with paid features**
4. **Graphic assets**:

   | Asset | Size | Source |
   | --- | --- | --- |
   | Application icons | 32×32, 48×48, 96×96, 128×128 PNG | `docs/store-assets/icon-*.png` |
   | Card banner | 220×140 PNG | `docs/store-assets/card-banner-220x140.png` |
   | Screenshots | 1280×800 PNG, 1–5 | Take 3, listed below |

   Screenshots:
   - The sidebar next to a sheet with a selected row
   - The preview dialog
   - A finished PDF next to the sheet with the write-back columns filled

## 5. Beta → Public

1. Install it from the unlisted listing with 3–5 testers on **consumer Gmail and Workspace accounts**. Workspace admins may block unverified apps.
2. Run the test checklist in the root README, plus:
   - An upgrade with a *different* billing email is still credited to the Google account.
   - Cancel in the Stripe customer portal. The account drops to free once the period ends, within the add-on's 6-hour Pro cache.
   - A sheet with a title banner is detected correctly.
3. Once OAuth verification is approved, switch visibility to **Public**, then set `MARKETPLACE_URL` in `site/public/site.js` and redeploy the site.
