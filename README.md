# SheetInvoice

Google Sheets add-on: select a row, get a branded invoice PDF in Drive, with the invoice number, status and link written back to the sheet.

- **Free:** 5 invoices/month, "Made with SheetInvoice" footer
- **Pro:** $6/mo or $49/yr, unlimited, no footer, email invoices to clients (license server in `license-worker/`)

## Layout

```
addon/              Apps Script project (pushed with clasp)
  appsscript.json     manifest; non-restricted scopes only (drive.file, not drive: no CASA audit)
  Code.js             menu, sidebar, sidebar state
  Starter.js          1-click formatted starter sheet
  Mapping.js          header-row detection, fuzzy auto-mapping, per-sheet mapping that follows moved columns
  Money.js            locale-aware amount parsing/formatting, tax + discount totals
  Profile.js          business profile + logo (UserProperties)
  Drive.js            Drive v3 REST helpers (drive.file scope; DriveApp would need the restricted drive scope)
  Invoice.js          row -> HTML template -> PDF -> Drive -> write-back; chunked runs, email, mark paid, preview
  License.js          plan lookup (Google ID token -> license Worker), usage limit, billing portal
  Sidebar.html        sidebar UI
  templates/          Classic.html, Modern.html
license-worker/     Cloudflare Worker + KV, Stripe webhook (see its README)
site/               landing page, privacy policy, terms (static; Cloudflare static assets)
docs/LAUNCH.md      ordered launch checklist (accounts, deploys, Stripe, verification)
docs/PUBLISHING.md  OAuth verification + Marketplace checklist and listing copy
docs/store-assets/  Marketplace/OAuth icons + banner (render.mjs regenerates them)
tests/              Node unit tests for the add-on's pure logic
```

Run every test with `npm test` from the repo root. It needs Node 20+ and nothing to install.

## Setup (one time)

1. Install clasp: `npm i -g @google/clasp`
2. Turn on the Apps Script API: https://script.google.com/home/usersettings
3. `clasp login` (opens a browser)
4. Create a test spreadsheet at https://sheets.new and copy its ID from the URL.
5. From `addon/`, bind a script to it:
   ```
   cd addon
   clasp create --type sheets --title "SheetInvoice" --parentId <SPREADSHEET_ID> --rootDir .
   ```
   This writes `addon/.clasp.json`, which is gitignored because it binds to your own script. To reuse an existing script instead, copy `.clasp.json.example` and fill in the IDs.
   If clasp asks to overwrite local files, answer **no**. Then check that `appsscript.json` still lists the seven scopes.
6. `clasp push` (use `clasp push --watch` while developing)

## Try it

1. Reload the spreadsheet → **Extensions → SheetInvoice → Open SheetInvoice**, then approve the permissions.
2. **Fastest path.**
   1. Click **Insert starter sheet**.
   2. Enter your business name and save.
   3. Click **Create invoice(s)**.
3. **Your own sheet.**
   - Headers can be in any of the first 10 rows, so a title banner is fine.
   - Columns like `Customer | Email | Services | Total | Due` are matched automatically. Check them under **Column mapping**.
   - Multiple items: in the Description cell, put one item per line, like `Logo design | 800` and `Brand guide | 400`.
4. Optional:
   - In the profile, set a tax name and rate, and a tax ID.
   - Map **Discount**, **Tax rate** or **Notes** columns for per-row values.
5. Select a row and click **Preview** to see the invoice in a dialog. Then click **Create invoice(s)**.
6. The PDF goes to a `SheetInvoice` folder in Drive. Any missing output columns are added automatically. The row gets the invoice number, `Unpaid` and an "Open PDF" link.

## Test checklist

- Mapping and profile persist after reloading the sheet
- The PDF shows the logo, the line items and the correct total, in both templates
- Selecting several rows creates one invoice each; already-invoiced rows are skipped
- Clicking Create twice quickly never produces duplicate invoice numbers or a second invoice for the same row
- Starter sheet: inserted, formatted, mapped, with row 2 selected; inserting again creates "Invoices 2"
- A sheet with a title banner in rows 1–3 detects the right header row; changing the header row re-maps the columns
- Preview opens a dialog and uses no invoice number and no usage
- The 6th invoice in a month is blocked on the free plan, with one error instead of one per selected row
- Insert a column before mapped columns: the mapping follows the headers. Rename a mapped header: the sidebar shows a warning, and Create refuses until the mapping is saved again
- A de_DE spreadsheet: `Audit | 1.200,50` parses as 1200.50, and money is formatted as `1.200,50 €`
- Tax and discount: Subtotal, Discount and Tax lines appear, and the total is (subtotal − discount) × (1 + rate)
- Selecting 30+ rows shows progress and finishes (5 rows per server call)
- Pro: "Email each invoice" sends the PDF from your Gmail and adds a note to the Status cell. "Email selected" resends existing invoices
- "Mark Paid" updates only rows that already have an invoice number
- "One sequence across all my spreadsheets": numbering continues across two spreadsheets
- Switching sheet tabs and then clicking into the sidebar reloads the mapping for the new tab
- Pro: "Manage billing" opens the Stripe portal
- The consent screen shows only: Sheets (current only), Drive (files used with this app), sidebar UI, external requests, send email as you, email/OpenID
