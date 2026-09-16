# Rowvoice - Product Roadmap & Agent Handoff Plan

This document outlines the complete roadmap for transforming the Rowvoice Apps Script prototype into a polished, monetized Google Workspace Marketplace add-on.

**Note to Agents:** When picking up a task from this roadmap, please update the status of the item (e.g., change `[ ]` to `[x]`) and document any architectural decisions in the relevant component's README or inline documentation.

Status legend: `[x]` built and unit-tested where possible · `[~]` built, needs verification in a real spreadsheet / account · `[ ]` not started

**Name (2026-09-16):** the product was renamed from SheetInvoice to **Rowvoice**. The trademark was checked and **rowvoice.com** was bought on Cloudflare. The license Worker is served at `api.rowvoice.com`, the site at `rowvoice.com`, and support email is `support@rowvoice.com`.

---

## Phase 1: Zero-Friction UX (Add-on Polish)
**Goal:** Ensure a user can install the add-on and generate their first invoice in under 15 seconds without having to read a manual.

- [~] **1-Click Starter Sheet**
  - **Component:** `addon/Starter.js` (new file instead of `Code.js`, to keep entry points small), `addon/Sidebar.html`
  - **Done:** A "New here?" card appears while the mapping is incomplete. It inserts an "Invoices" tab (or "Invoices 2", and so on) with:
    - A styled, frozen header row
    - 2 sample rows, one of them with multiple line items
    - Number and date formats
    - A Status dropdown with colour rules
    - A saved mapping
  - It then selects row 2, so the next click is Create.
- [x] **Smart Auto-Mapping (Heuristic Detection)**
  - **Component:** `addon/Mapping.js` (`HEADER_SYNONYMS`, `autoMapHeaders_`)
  - **Decisions:**
    - Synonyms are ranked, and the assignment is greedy one-to-one, so "Client email" maps to email and not to client.
    - Generic words ("name", "item") only match exactly.
    - Output columns (Invoice #, Status, PDF) **only ever match exactly**, because a fuzzy match could overwrite user data (for example "Invoice date").
    - A detected mapping is used live (`auto: true`) and saved once the user saves it or creates an invoice. Creating an invoice now adds missing output columns automatically.
- [x] **Flexible Header Row Detection**
  - **Component:** `addon/Mapping.js` (`detectHeaderRow_`), plus a "Header row" selector in the sidebar as a manual override
  - **Decisions:**
    - Each of the first 10 rows is scored: text cells, plus 3× cells that look like known headers, minus cells with numbers or dates.
    - `headerRow` is stored in the mapping. Old mappings without it default to 1.
    - Data rows start at `headerRow + 1` everywhere.
- [~] **PDF Preview Modal**
  - **Component:** `addon/Invoice.js` (`showInvoicePreview`), `addon/Sidebar.html`
  - **Done:** "Check row" became "Preview". It opens a modal that renders the real template for the first selected row, with the next invoice number and a notice bar. It creates no PDF, uses no number and counts no usage. Generation and preview share `readRow_` and `buildInvoice_`.

**Also fixed while here (Invoice.js):**
- Each row is generated under the document lock, and the row is re-read inside the lock. Before, a double click or two collaborators could invoice the same row twice.
- The invoice counter only advances after the PDF is saved in Drive, so a failed upload leaves no gap in the numbering.
- The logo is downloaded once per run instead of once per row.
- Hitting the free limit stops the batch with one error instead of repeating it for every selected row.

---

## Phase 2: Monetization & Licensing (Cloudflare + Stripe)
**Goal:** Implement a lightweight, serverless licensing system that unlocks the Pro tier ($6/mo or $49/yr).

- [x] **Cloudflare Worker Setup (`license-worker/`)**
  - **Decision (changed from plan):** it's `GET /api/check-license` with `Authorization: Bearer <Google ID token>`, **not** `?email=`.
    - An open email lookup would let anyone see who pays, and anyone could claim to be someone else.
    - The token comes from `ScriptApp.getIdentityToken()` (adds the non-sensitive `openid` scope). The Worker verifies it against Google's JWKS.
  - The code is plain ES modules with no runtime dependencies. There are 15 tests, run with `node --test`. See `license-worker/README.md`.
- [x] **Stripe Webhook Integration**
  - `POST /api/webhook` with HMAC signature verification (Web Crypto) and 5-minute replay tolerance.
  - It handles `checkout.session.completed` and `customer.subscription.created/updated/deleted`.
  - Out-of-order and stale events are ignored by comparing Stripe event timestamps. Ending an old subscription never revokes a newer active one.
  - The purchase is tied to the **Google account**, which the add-on sends as base64url `client_reference_id` on the Payment Link, rather than the email typed at checkout.
- [~] **Add-on License Enforcement (`addon/License.js`)**
  - Pro removes the footer and the limit, as before. The Free plan is cached for 10 minutes, so an upgrade shows up quickly, and Pro for 6 hours.
  - "Already upgraded? Refresh" skips the cache.
  - If the license server is down, a user who was Pro in the last 3 days stays Pro.
  - **To go live:** set `LICENSE_API_BASE` and `UPGRADE_URLS`, replace the placeholder origin in `urlFetchWhitelist`, and put the `aud` from `debugIdentityToken()` into the Worker's `GOOGLE_CLIENT_IDS`.

---

## Phase 3: Landing Page & Legal (Marketing Site)
**Goal:** Build a conversion-optimized marketing site and satisfy Google's legal requirements for Marketplace publishing.

- [x] **Landing Page (`site/`)**
  - **Decision:** plain static HTML and CSS rather than Vite, Tailwind or Astro. A three-page site doesn't need a build step. It deploys as Cloudflare Workers static assets (`site/wrangler.jsonc`).
  - Contents:
    - A hero with an HTML/CSS demo of a sheet row becoming an invoice
    - How it works, features and a pricing section with a monthly/yearly toggle
    - FAQ
    - Light and dark themes, checked at desktop and 390px widths
  - Every claim on the page matches implemented behaviour. The FAQ and pricing were updated when emailing (Pro), tax and discounts were added.
- [~] **Legal Pages (Required for App Verification)**
  - `privacy.html` covers:
    - A data inventory table
    - Each OAuth scope and what it's used for
    - The license check
    - Stripe
    - Google's Limited Use disclosure
  - `terms.html` covers plans, renewal and cancellation, and says the user is responsible for invoice and tax accuracy.
  - **Needs a human:** replace the highlighted placeholders (legal name, address, contact email, refund policy, governing law) and have a lawyer review. See `site/README.md`.

---

## Phase 4: Google Workspace Marketplace Publishing
**Goal:** Distribute the add-on globally. (Note: These steps require manual developer action in the Google Cloud Console.)

Step-by-step guide with scope justifications and listing copy: **`docs/PUBLISHING.md`**. Everything that needs your accounts, in order: **`docs/LAUNCH.md`**. Store icons and banner: `docs/store-assets/`.

- [ ] **Standard GCP Project Creation**
  - Create a standard Google Cloud Project and link it to the Apps Script project via Project Settings. (This changes the ID token audience. Update `GOOGLE_CLIENT_IDS`.)
- [ ] **OAuth Consent Screen Configuration**
  - Configure the OAuth consent screen with the application name, logo, and links to the Privacy Policy and Terms of Service created in Phase 3.
  - Submit for Google Trust & Safety verification.
  - **Correction:** the prototype manifest requested the full `drive` scope, which **is restricted** and would have required a CASA security assessment. It has been changed to `drive.file`, which is what the code and README already assumed. Current scopes:
    - `spreadsheets.currentonly`
    - `drive.file`
    - `script.container.ui`
    - `script.external_request`
    - `script.send_mail` (added for emailing invoices)
    - `userinfo.email`
    - `openid`
  - None of these are restricted.
- [ ] **Marketplace Store Listing**
  - Enable the Google Workspace Marketplace SDK.
  - Create store assets: 32x32, 48x48, 96x96, 128x128 icons, a 220x140 card banner, and 1280x800 screenshots showing the 1-click invoice creation process.
  - Publish (start as Unlisted for beta testing, then switch to Public).

---

## Improvements found during the build (all done)

Status: `[x]` unit-tested · `[~]` needs checking in a real spreadsheet or account.

- [x] **1. Mappings follow moved columns.**
  - `Mapping.js` stores header names next to column numbers. `resolveMapping_` follows a moved header to the nearest column with the same name.
  - A renamed or deleted header is reported (`missing`), never guessed. The sidebar shows a warning, and invoicing is refused until the mapping is saved again.
  - Mappings saved before this change are trusted as they are.
- [~] **2. Server-side usage count.**
  - `POST /api/usage` on the Worker counts invoices per Google account per month. `check-license` returns the count.
  - The add-on uses the higher of the local and server counts, so clearing script data doesn't reset the free limit.
  - Counting is best effort when offline. KV isn't atomic; see `license-worker/README.md`.
- [x] **3. Locale-aware amounts.**
  - `Money.js` parses text amounts using the spreadsheet locale's decimal separator. For example, `1.200,50`, `1.200` in de_DE, `(300)` and `CHF 1'200.50` all parse correctly.
  - Money is formatted in the spreadsheet locale.
- [x] **4. Tax, discount and notes.**
  - The profile has a tax name, default rate and tax ID.
  - New optional mapping fields: Discount (amount), Tax rate % (overrides the profile rate; percent-formatted cells supported) and Notes.
  - Totals are (subtotal − discount) + tax, rounded to the cent. Both templates show the Subtotal, Discount and Tax lines only when they apply.
- [~] **5. Emailing invoices and "Mark Paid".**
  - Emailing is Pro (`EMAIL_IS_PRO_FEATURE` in `License.js`). The email goes out through `MailApp` from the user's Gmail, with the PDF attached, replies to the business email, and subject and body templates with `{placeholders}`.
  - Email is a checkbox on Create, plus "Email selected" to resend existing invoices using the PDF linked in the row.
  - Each send adds a note to the Status cell. The daily quota is checked, and email failures are reported per row without losing the invoice.
  - "Mark Paid" updates the status of invoiced rows only.
  - This adds the `script.send_mail` scope, which is included in the manifest, privacy policy and publishing guide.
- [~] **6. Account-wide invoice numbering.** The profile option "One sequence across all my spreadsheets" uses a UserProperties counter under the user lock. The first switch continues from the current spreadsheet's count. Every row takes the document lock, then the user lock, always in that order.
- [~] **7. Chunked batch runs.**
  - `prepareInvoiceRun` validates the run and adds output columns. The sidebar then calls `generateInvoicesForRows` 5 rows at a time, with a progress bar.
  - The limit went from 25 to 200 rows. Hitting the free limit stops the run and reports how many rows weren't processed.
- [~] **8. Noticing sheet tab switches.** When the sidebar regains focus or the mouse enters it, it checks the active sheet ID (throttled to one check every 2 s) and reloads the mapping if the tab changed.
- [~] **9. Billing portal.** `POST /api/portal` on the Worker (needs `STRIPE_SECRET_KEY` and `PORTAL_RETURN_URL`), plus a "Manage billing" link for Pro users. The window opens during the click, so popup blockers don't stop it.
- [x] **10. Manifest cleanup.** The unused `googleapis.com` entry was replaced with the Worker origin placeholder, and the API base URL is now `LICENSE_API_BASE`.

Also fixed: the "Amount" column header in both invoice templates was left-aligned mid-page because a more specific CSS rule overrode it. It now sits above the amounts.

## Next ideas

- **Automatic overdue status.** A daily time-driven trigger would mark Unpaid rows past their due date as Overdue. It needs an installable trigger per spreadsheet.
- **Payment links on invoices.** A Stripe Payment Link or PayPal URL per invoice (a Pro upsell).
- **Exact usage counts.** Move the Worker's counter to a Durable Object if the free limit ever needs to be exact.
