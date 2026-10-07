# Roadmap

Rowvoice turns a Google Sheets row into a branded PDF invoice in Drive and writes the invoice number, status, and link back to the sheet. Pro subscriptions are checked by a Cloudflare Worker and billed with Stripe.

The marketing site is live at [rowvoice.com](https://rowvoice.com). The Google Workspace Marketplace listing is not public yet, and OAuth verification is not complete.

## In the product

- **Starter sheet.** One click inserts a formatted Invoices tab, sample rows, a status dropdown, and a saved mapping.
- **Column mapping.** Header synonyms are matched one-to-one. Output columns (invoice number, status, PDF) match only on the exact header, so a fuzzy match cannot overwrite user data. Mappings follow a moved column and refuse to invoice if a header was renamed or deleted.
- **Header row.** The first 10 rows are scored so a title banner does not have to be deleted. The sidebar can override the detected row.
- **Preview.** Opens the real template for the selected row without creating a PDF, consuming a number, or counting usage.
- **Safe numbering.** Each row is generated under a document lock and re-read inside the lock. The counter advances only after the PDF is saved.
- **Plans.** Free is 5 invoices a month with a footer. Pro removes the footer and the limit, can email the PDF from the user's Gmail, and can open the Stripe billing portal. The license request is a Google ID token, not an email query parameter.
- **Money.** Amounts follow the spreadsheet locale. Optional tax, discount, and notes. Totals are rounded to the cent.
- **Batches.** The sidebar sends rows in small chunks and shows progress. The free-plan limit stops the run once, instead of once per row.
- **Site and legal pages.** Static HTML on Cloudflare: landing page, privacy policy, terms, and support. Install buttons stay on "Notify me" until `MARKETPLACE_URL` is set.

## Publishing

Listing on the Google Workspace Marketplace still needs Google's OAuth review and a public store listing. The steps and the text for those forms are in `docs/PUBLISHING.md` and `docs/VERIFICATION_KIT.md`. Store icons and the card banner are in `docs/store-assets/`.

Current scopes are non-restricted: `spreadsheets.currentonly`, `drive.file`, `script.container.ui`, `script.external_request`, `script.send_mail`, `userinfo.email`, and `openid`. The full `drive` scope is intentionally not used.

## Later

- Mark unpaid invoices overdue with a daily trigger.
- Optional payment link on the PDF, as a Pro feature.
- Move the free-plan counter to a Durable Object if the count needs to be exact under concurrent creates. KV increments are good enough for a soft limit.
