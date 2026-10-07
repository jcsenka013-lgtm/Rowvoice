# Verification and Marketplace kit

Field-by-field reference and listing copy are in `docs/PUBLISHING.md`. Work top to bottom.

The Workspace Marketplace listing is **not public**, and OAuth verification is **not complete**. A demo video for Google's review stays **Unlisted**. Do not link it from the website, the README, or a public profile.

Record real IDs in local `docs/OPERATOR_NOTES.md` (gitignored), not in this file.

| Item | Value |
| --- | --- |
| Apps Script deployment ID | `YOUR_DEPLOYMENT_ID` (version you deployed for the Marketplace SDK) |
| Homepage | https://rowvoice.com |
| Privacy policy | https://rowvoice.com/privacy |
| Terms of service | https://rowvoice.com/terms |
| Support URL | https://rowvoice.com/support |
| Support email | support@rowvoice.com |
| Logo, 120×120 | `docs/store-assets/oauth-logo-120.png` |
| Icons | `docs/store-assets/icon-{32,48,96,128}.png` |
| Card banner, 220×140 | `docs/store-assets/card-banner-220x140.png` |
| Demo data | `docs/demo/demo-invoices.csv` (`.example` addresses only) |

## 1. Verify rowvoice.com in Search Console

1. Open https://search.google.com/search-console using the Google account that will own the Cloud project (`you@example.com` in these notes; use the real account only in your local operator file).
2. Choose **Add property → Domain** and enter `rowvoice.com`.
3. Google shows a TXT record. Because the domain is on Cloudflare, Google often offers **Start verification** and adds the record after you authorize Cloudflare. Otherwise add a **TXT** record named `@` in the Cloudflare DNS for rowvoice.com.
4. Click **Verify**.

## 2. Standard Google Cloud project

1. Go to https://console.cloud.google.com, create a project (for example `rowvoice-prod`), and copy the **project number** (digits only) into your local operator notes as `YOUR_GCP_PROJECT_NUMBER`.
2. Create a basic consent screen before linking Apps Script. **Google Auth Platform → Get started**:
   - App name `Rowvoice`
   - Support email: an address on an account you own
   - Audience **External**
   - Contact email: an address you control
3. Under **Audience → Test users**, add the accounts that should authorize the app while it is in Testing.
4. Open the script with `cd addon && clasp open-script`. Go to **Project Settings → Google Cloud Platform (GCP) Project → Change project**, paste the project number, and click **Set project**.
5. Linking changes the OAuth client ID. Open the sidebar once, then add the new audience to `GOOGLE_CLIENT_IDS` (see `docs/LAUNCH.md`). Until that ID is allowed, the sidebar stays on the Free plan.

## 3. OAuth consent screen

Before submitting, confirm none of the scopes are listed as restricted, and that Search Console has verified rowvoice.com.

In the Cloud project, open **Google Auth Platform**:

- **Branding:** app name `Rowvoice`, support email `support@rowvoice.com` (or an account you own if the form requires it), logo `oauth-logo-120.png`, homepage, privacy policy, and terms from the table above, authorized domain `rowvoice.com`, developer contact email you control.
- **Audience:** External.
- **Data access:** the seven scopes in `docs/PUBLISHING.md`, with those justifications.
- **Submit for verification** after the demo video below is uploaded. Submission is not the same as approval.

## 4. Demo video (about 2 minutes, unlisted YouTube)

**Before recording:**

- Make a new spreadsheet called "Rowvoice demo".
- **File → Import → Upload** `docs/demo/demo-invoices.csv` and choose **Replace current sheet**.
- The last sample row uses `you@example.com`. For the recording only, replace that row with an address you control. Do not commit that change.
- Remove Rowvoice's access so the consent screen appears: https://myaccount.google.com/permissions → Rowvoice → **Remove access**.
- Record at 1080p and narrate or caption the scopes.

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | rowvoice.com homepage | "Rowvoice is a Google Sheets add-on that turns spreadsheet rows into PDF invoices." |
| 0:10 | Extensions → Rowvoice → Open. Consent screen with every permission visible. | "These are the permissions Rowvoice asks for." |
| 0:30 | Approve. Sidebar opens; header row and columns auto-matched. | "Spreadsheet access is for this spreadsheet only." |
| 0:45 | Business profile, then Preview on row 2. | "The sidebar and this preview dialog are the third-party UI permission." |
| 1:00 | Create invoices for rows 2–5. Invoice number, Unpaid, and Open PDF appear. | "Invoices are created and written back to these rows." |
| 1:15 | Open a PDF and show the Rowvoice folder in Drive. | "Drive access is limited to files Rowvoice creates." |
| 1:30 | Usage box, Pro checkout with a test card, Refresh showing Pro. | "External requests go to the license server to check the subscription." |
| 1:45 | Email one invoice, then open the message with the PDF attached. | "Send-mail sends from my account when I tick the box. It cannot read mail." |
| 2:00 | Status note, then Mark Paid. | "That's the whole flow." |

Upload to YouTube as **Unlisted** and paste the link only into Google's verification form.

- The consent screen name must read **Rowvoice**.
- Use the demo data, not real client data.
- Keep the browser at 100% zoom so the scope text is readable.

## 5. Screenshots (1280×800)

Use the demo spreadsheet at 1280×800:

1. Rows invoiced, sidebar open.
2. Preview dialog on the Modern template.
3. The PDF open in Drive next to the sheet.
4. Column mapping on a sheet with a title banner.
5. Optional: sidebar showing Pro and the email checkbox.

Save them locally or under `docs/store-assets/screenshots/` only if they contain no customer data.

## 6. Marketplace SDK

Enable **Google Workspace Marketplace SDK** in the Cloud project.

- **App configuration:** visibility **Private** for the beta, individual and admin install, Sheets add-on, deployment ID `YOUR_DEPLOYMENT_ID` and the matching version, the same seven scopes, developer name `CAPTURES BY JC LLC`, website https://rowvoice.com, email support@rowvoice.com.
- **Store listing:** description from `docs/PUBLISHING.md`, category Business tools, icons and banner from `docs/store-assets/`, terms, privacy, and support URLs from the table above, pricing **Free with paid features**.
- Publish unlisted, then share the install link with a few beta testers, including one Workspace account. Switch to Public only after OAuth verification is approved.

## Releasing a new add-on version

```sh
cd addon
clasp push
clasp create-version "v1.0.x: what changed"
clasp update-deployment YOUR_DEPLOYMENT_ID --versionNumber <n>
```

The Marketplace listing can keep pointing at the same deployment ID.
