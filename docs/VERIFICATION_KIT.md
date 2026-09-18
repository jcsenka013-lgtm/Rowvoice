# Verification & Marketplace kit

Everything you need, ready to use, for the Google steps that need your login: Search Console, the Google Cloud project, the OAuth consent screen, the demo video, screenshots and the Marketplace SDK. Work top to bottom. Field-by-field reference and listing copy are in `docs/PUBLISHING.md`.

**Already prepared:**

| Item | Value |
| --- | --- |
| Apps Script deployment ID (Marketplace SDK) | `AKfycbz3gi8NYiD8KlLtc73wex5juccVTDWXxcosr2AcEYVETrgODwnmtKMx9x-ucbXTG56p`, version **1** (`v1.0.0-beta`, Stripe test mode) |
| Homepage | https://rowvoice.com |
| Privacy policy | https://rowvoice.com/privacy |
| Terms of service | https://rowvoice.com/terms |
| Support URL | https://rowvoice.com/support |
| Support email | support@rowvoice.com (forwards to your Gmail) |
| Logo, 120×120 | `docs/store-assets/oauth-logo-120.png` |
| Icons | `docs/store-assets/icon-{32,48,96,128}.png` |
| Card banner, 220×140 | `docs/store-assets/card-banner-220x140.png` |
| Demo data | `docs/demo/demo-invoices.csv` |

## 1. Verify rowvoice.com in Search Console (5 minutes)

1. Open https://search.google.com/search-console using **the Google account that will own the Cloud project** (jcsenka013@gmail.com).
2. Choose **Add property → Domain** and enter `rowvoice.com`.
3. Google shows a TXT record. Because the domain is on Cloudflare, Google usually offers **"Start verification" → sign in to Cloudflare → Authorize**, and adds the record for you. If not, go to Cloudflare → rowvoice.com → **DNS → Add record**, choose type **TXT**, name `@`, and paste the value.
4. Click **Verify**. Once verified, tell Claude. Nothing else changes.

## 2. Standard Google Cloud project (10 minutes)

1. Go to https://console.cloud.google.com, open the project dropdown, click **New project**, name it `rowvoice-prod` and click Create.
2. On the project dashboard, copy the **Project number** (digits only).
3. Open the script with `cd addon && clasp open-script`. Go to **Project Settings (gear) → Google Cloud Platform (GCP) Project → Change project**, paste the number and click **Set project**.
4. **This changes the add-on's Google client ID.** Open the Rowvoice sidebar in the test spreadsheet once, then tell Claude. Claude reads the new ID from the Worker and adds it, the same way as before. Until then, the sidebar shows the Free plan.

## 3. OAuth consent screen (15 minutes)

In the Cloud console for `rowvoice-prod`, open **Google Auth Platform** (called **APIs & Services → OAuth consent screen** in older consoles).
- **Branding:**
  - App name `Rowvoice`
  - Support email `support@rowvoice.com`, or your Gmail if it must be an account you own
  - Logo `oauth-logo-120.png`
  - Home page, privacy policy and terms of service: the URLs above
  - Authorized domain: `rowvoice.com`
  - Developer contact email: your Gmail
- **Audience:** External.
- **Data access (scopes):** add exactly these, with the justifications from `PUBLISHING.md` section 2:
  - `.../auth/spreadsheets.currentonly`
  - `.../auth/drive.file`
  - `.../auth/script.container.ui`
  - `.../auth/script.external_request`
  - `.../auth/script.send_mail`
  - `.../auth/userinfo.email`
  - `openid`
- **Submit for verification** once the demo video (step 4) is uploaded.

## 4. Demo video (about 2 minutes, unlisted YouTube)

**Before recording:**
- Make a new spreadsheet called "Rowvoice demo".
- Go to **File → Import → Upload** `docs/demo/demo-invoices.csv` and choose **Replace current sheet**.
- In the last row, put your own name and Gmail.
- Remove Rowvoice's access so the consent screen appears: https://myaccount.google.com/permissions → Rowvoice → **Remove access**.
- Use the Windows **Snipping Tool → Record**, or the Xbox Game Bar (Win+G), at 1080p. Narrate, or add captions.

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | rowvoice.com homepage | "Rowvoice is a Google Sheets add-on that turns spreadsheet rows into PDF invoices." |
| 0:10 | Extensions → Rowvoice → Open. **Consent screen with every permission visible.** Scroll slowly. | "These are the permissions Rowvoice asks for." Read each one briefly. |
| 0:30 | Approve. Sidebar opens; header row and columns auto-matched. | "Spreadsheet access, for this spreadsheet only: Rowvoice reads the header row and the rows I select." |
| 0:45 | Business profile: enter a name and save. Select row 2 and click **Preview**. | "The sidebar and this preview dialog are the third-party UI permission." |
| 1:00 | Select rows 2–5 and click **Create invoice(s)**. The write-back appears (Invoice #, Unpaid, Open PDF). | "Invoices are created and written back to these rows." |
| 1:15 | Click **Open PDF**. Show the **Rowvoice folder in Drive**. | "Drive access is limited to files Rowvoice creates: this folder, the PDFs and my logo. It can't see my other files." |
| 1:30 | Sidebar usage box and upgrade link. Briefly show **Pro $6/mo** checkout, a test card, and **Refresh** showing Pro. | "External requests go to our license server at api.rowvoice.com to check the subscription, using my Google sign-in to identify the account." |
| 1:45 | Last row (your Gmail): tick **Email each invoice** and click Create. Switch to Gmail and open the email with the PDF attached. | "Send-mail permission: with this box ticked, Rowvoice emails the invoice from my Gmail. It can't read my mail." |
| 2:00 | Status cell note "Emailed to…". Click **Mark Paid**. | "That's the whole flow." |

Upload to YouTube as **Unlisted**, and paste the link into the verification form.

Tips:
- **The app name on the consent screen must read "Rowvoice".** If it still says "SheetInvoice", rename the Apps Script project first; step 2 fixes this once the GCP project is linked.
- **Use the demo data, not real client data.**
- **Keep the browser at 100% zoom** so the scope text is readable.

## 5. Screenshots (1280×800, 3–5)

Use the "Rowvoice demo" spreadsheet with the browser at **1280×800**:
- Chrome DevTools (F12) → device toolbar → Responsive → 1280×800 → ⋮ → **Capture screenshot**, or resize the window and use Win+Shift+S.

Shots:
1. The sheet with rows 2–5 invoiced (Invoice #, statuses, Open PDF links) and the sidebar open.
2. The **Preview** dialog showing the Modern template with a logo.
3. The PDF open in Drive next to the sheet.
4. Column mapping with auto-matched columns on a sheet with a title banner in row 1.
5. Optional: the sidebar showing **Pro plan** and the email checkbox.

Save them to `docs/store-assets/screenshots/` if you want them in the repo.

## 6. Marketplace SDK (after the consent screen is submitted)

In `rowvoice-prod`, go to **APIs & Services → Library → "Google Workspace Marketplace SDK" → Enable**.
- **App configuration:**
  - Visibility **Private**. It's labelled Unlisted in some consoles; use it for the beta.
  - Installation: individual and admin install.
  - App integration: **Sheets add-on**, with deployment ID `AKfycbz3gi8NYiD8KlLtc73wex5juccVTDWXxcosr2AcEYVETrgODwnmtKMx9x-ucbXTG56p`, version `1`.
  - OAuth scopes: the same seven as above.
  - Developer name: `CAPTURES BY JC LLC`, or "Rowvoice" once the trade name is approved.
  - Developer website: https://rowvoice.com. Developer email: support@rowvoice.com.
- **Store listing:**
  - The description text from `PUBLISHING.md` section 4.
  - Category: Business tools.
  - Icons, banner and screenshots from `docs/store-assets/`.
  - Terms, privacy and support URLs from the table above.
  - Pricing: **Free with paid features**.
- **Publish.** Then share the install link with 3–5 beta testers, including at least one on a Google Workspace (company) account.

## Releasing a new add-on version later

Claude runs these when code changes:

```sh
cd addon
clasp push
clasp create-version "v1.0.x: what changed"
clasp update-deployment AKfycbz3gi8NYiD8KlLtc73wex5juccVTDWXxcosr2AcEYVETrgODwnmtKMx9x-ucbXTG56p --versionNumber <n>
```

The Marketplace keeps pointing at the same deployment ID, so the listing doesn't need editing.
