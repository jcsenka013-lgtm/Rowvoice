# Business setup: Rowvoice under Captures by JC LLC (Oklahoma)

Plan: run Rowvoice as a trade name (DBA) of the existing Oklahoma LLC, **Captures by JC LLC, doing business as Rowvoice**. No new company and no new EIN.

Researched September 2026 from official sources, linked below. This is not legal or tax advice. A 30-minute call with your accountant is worth it before taking live payments.

## Status (2026-09-18)

| Item | Status |
| --- | --- |
| LLC | ✅ **CAPTURES BY JC LLC**, Oklahoma, formed 2025-12-30. **First annual certificate ($25) due 2026-12-30.** |
| Legal pages | ✅ Live: "a product of CAPTURES BY JC LLC", Oklahoma law, 30-day money-back guarantee, email-only contact |
| EIN | ✅ **Applied 2026-09-18.** Keep the CP 575 confirmation letter with the LLC documents. If it wasn't saved, get a 147C letter from the IRS at 800-829-4933. Don't put the number in this repo. |
| Trade name "Rowvoice" | ⏳ **Submitted 2026-09-18**, awaiting processing (document 78555660003, session 091826NCOYKM). When the SOS emails: pay any balance in the Briefcase, download the filed report, then tell Claude to switch the pages to "d/b/a Rowvoice". |
| Business bank account | ⬜ None yet (step 4) |
| Public mailing address | Not needed for now. The pages list email only. Get a PO box before sending any marketing email, which must show a postal address. |

## Refund policy (chosen 2026-09-18)

- **30-day money-back guarantee** on the first payment, monthly or yearly, with no reason needed.
- **Forgot to cancel a yearly plan?** Full refund within 14 days of the renewal charge.
- **Otherwise:** no partial refunds, but Pro stays active until the end of the paid period.

Why: Invoice Ninja, the closest invoicing competitor with a published policy, offers 30 days, and small-SaaS guidance is 14–30 days. At $6–$49, a refund is cheaper than a chargeback (Stripe charges a dispute fee on top of the reversed payment). Rowvoice also has a free plan, so people can try it before paying. The policy lives in `site/public/terms.html`.

## Checklist, in order

### 1. Confirm the LLC is in good standing (free, 5 minutes)
- Look it up at [sos.ok.gov](https://www.sos.ok.gov/business/default.aspx) → Business Entity Search. Note the **exact legal name**, including punctuation such as "Captures by JC, LLC".
- The **LLC Annual Certificate** is $25 a year, due on the anniversary of the LLC's formation. Missing it by more than 60 days loses good standing, which Stripe and the trade name filing can both trip on.
- Check that your articles or operating agreement don't limit the LLC to photography. Most Oklahoma LLCs are formed for "any lawful purpose", which covers software.

### 2. File the Trade Name Report for "Rowvoice" ($25 + 4% card fee, online)
- **Where:** [sos.ok.gov](https://www.sos.ok.gov/business/default.aspx) → file a Trade Name → choose **"Business Entity registered with the Oklahoma Secretary of State"**. The paper version is [SOS Form 0021](https://www.sos.ok.gov/forms/fm0021.pdf), filed under Title 18 §1140.
- **What the form asks for:**
  1. Trade name: `Rowvoice`
  2. Address(es) where the business is carried on under that name, i.e. where you run it from
  3. Description, e.g. *"Software: a Google Sheets add-on for creating and sending invoices, sold by online subscription."*
  4. Legal name of the entity: the exact name from step 1
  5. Type: **limited liability company**
  6. State formed: **Oklahoma**

  Then sign it as a member or manager, and ask for the documents to be returned electronically.
- **What it does and doesn't do:**
  - It doesn't expire and needs no renewal.
  - It does **not** give exclusive rights to the name (that's what a trademark does, see step 8), and it doesn't create a new company.
- **Keep the filed copy.** Your bank and Stripe will ask for it as the "DBA statement".

### 3. EIN
If the LLC doesn't have an EIN yet, get one **free** at [irs.gov/ein](https://www.irs.gov/businesses/small-businesses-self-employed/employer-identification-number). It takes about 10 minutes online, and **avoid paid "EIN services"**. Banks and Stripe both need it for an LLC. Save the confirmation letter (CP 575). A trade name doesn't need its own EIN: [When to get a new EIN](https://www.irs.gov/businesses/small-businesses-self-employed/when-to-get-a-new-ein).

### 4. Banking
- **What banks ask an LLC for:**
  - The EIN confirmation letter
  - Articles of Organization, from your sos.ok.gov account
  - An operating agreement. Write a one-page single-member one if you don't have it; templates are free.
  - Your photo ID
  - The filed trade name report, if the account should also accept "Rowvoice"
- **Options:**
  - A local bank or credit union
  - An online business bank. Mercury, Relay and Bluevine are common with Stripe, and usually have no monthly fee or minimum balance.
- **Simplest setup:** one LLC checking account for now, with "Rowvoice" added as a DBA once the trade name is filed. Add a second account, or a sub-account (Relay and Mercury offer them free), if you want photography and Rowvoice money apart.
- **Stripe requires the payout account to be in the LLC's legal name or its DBA.**
- Keeping Rowvoice money separate from the photography business makes taxes, and the liability protection, much cleaner.

### 5. Stripe: switch to live mode
When you activate the account ([Activate your account](https://docs.stripe.com/get-started/account/activate)):

| Field | Enter |
| --- | --- |
| Business type | LLC |
| Legal name | Exact LLC name, with the LLC's EIN |
| Doing business as | Rowvoice |
| Website | https://rowvoice.com |
| Product description | Subscription software for invoicing from Google Sheets |
| Statement descriptor | `ROWVOICE` (5–22 Latin characters; must reflect your DBA, URL or legal name) |
| Support email | support@rowvoice.com |
| **Business address** | A **physical address where you run the business**. Stripe does **not** accept PO boxes or virtual mailbox addresses for this. |

- If Stripe asks for supporting documents, upload the trade name report.
- Then give me the live secret key (as with the test key) and I'll run `license-worker/scripts/stripe-setup.mjs` in live mode. That's LAUNCH.md step 8.

Sources: [statement descriptors](https://docs.stripe.com/get-started/account/statement-descriptors), [physical presence requirement](https://support.stripe.com/questions/physical-presence-requirement-faq), [supporting documents](https://support.stripe.com/questions/supporting-documents-to-further-review-the-account), [company name and bank account owner](https://support.stripe.com/questions/company-name-(legal-or-dba)-and-bank-account-owner-name-are-different).

### 6. Which address goes where
- **Stripe (private, verified):** the physical business address, as above.
- **Privacy policy and terms (public):** any address where the LLC receives mail. A PO box or the LLC's registered agent address is fine here and keeps your home address off the website.
- **Trade name report:** the address where the business is carried on.

### 7. Taxes
- **Oklahoma sales tax: none on Rowvoice.** Oklahoma exempts software delivered electronically, including SaaS (68 O.S. §1357). No Oklahoma sales tax permit is needed for Rowvoice. If the photography side already has one, that doesn't change.
- **Other US states.** Some states tax SaaS (for example Texas, Washington, New York and Pennsylvania), but you only owe tax there after passing that state's "economic nexus" threshold, typically about $100,000 in sales. That's far off. Stripe Tax can track it for you.
- **EU and UK customers: decide before going live.** A non-EU seller owes **EU VAT from the first sale** to an EU consumer. There's no threshold. The UK has a similar rule. Options:
  1. Turn on **Stripe Tax** and register for the EU **Non-Union OSS** scheme: one registration and one quarterly return for all EU countries.
  2. Switch payments to a **merchant of record** (Paddle or Lemon Squeezy). They are the legal seller, handle worldwide tax for a higher fee (around 5% + 50¢), and pay you out.
  3. Restrict sales to the US at first, and revisit.

  Option 3 is simplest for a soft launch. Option 2 is least work long term if you expect international customers.
- **Income tax.** LLC profits pass through to your personal return as before, so there's no separate Oklahoma franchise tax for an LLC. Tell your accountant it's a second line of business, and keep separate books.

### 8. Protect the name (optional but recommended)
- **Federal trademark (recommended for an online product):** [USPTO](https://www.uspto.gov/trademarks/trademark-fee-information).
  - The fee is $350 per class. Use **Class 42** (software as a service).
  - Pick the description from the USPTO ID Manual, because a custom description adds $200.
  - File in the **LLC's name**.
- **Oklahoma state trademark:** [$50 per class](https://www.sos.ok.gov/trademarks/default.aspx), valid 10 years. It's cheaper, but it only covers Oklahoma, and Rowvoice sells nationwide.

### 9. Licenses and privacy law
- **Licenses.** Oklahoma has **no general statewide business license**: [Oklahoma.gov licenses and permits](https://oklahoma.gov/business/operate/licenses-and-permits.html). Check whether your city requires a home-occupation license. Most don't for online-only work.
- **Oklahoma Consumer Data Privacy Act (SB 546)** takes effect **January 1, 2027**. It only applies at 100,000+ Oklahoma consumers, or 25,000+ if most revenue comes from selling data. Rowvoice is far below that, and it doesn't sell data.

## Costs

| Item | Cost | When |
| --- | --- | --- |
| Trade name report | $25 (+4% card fee) | Once |
| LLC annual certificate | $25/year | You already pay this |
| Federal trademark, Class 42 | $350 | Optional, recommended |
| Oklahoma trademark | $50 per class / 10 years | Optional |
| Stripe Tax (if used) | Per-transaction fee | At live launch, if selling to the EU or UK |

## Send Claude afterwards (to finish the legal pages)
1. The exact LLC legal name, as shown on sos.ok.gov
2. The public mailing address for the privacy policy and terms
3. Refund policy, e.g. "full refund within 14 days of the first payment"
4. Whether the trade name report is filed. If it is, the pages say "Captures by JC LLC, doing business as Rowvoice".

Governing law will be **Oklahoma**.
