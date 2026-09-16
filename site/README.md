# SheetInvoice site

A static landing page, privacy policy and terms. It has no build step: plain HTML and CSS in `public/`, served as Cloudflare Workers static assets.

```sh
npx wrangler dev      # http://localhost:8787
npx wrangler deploy
```

Then attach a custom domain in the Cloudflare dashboard. Google's OAuth verification requires the privacy policy and terms to be on a domain you've verified in Search Console.

## Before publishing

Search `public/` for these placeholders and replace them all:

| Placeholder | Replace with |
| --- | --- |
| `MARKETPLACE_URL` | Google Workspace Marketplace listing URL |
| `CONTACT_EMAIL` | Support address. It must match the OAuth consent screen. |
| `<mark class="todo">` blocks | Legal name, postal address, refund policy, governing law |

Have a lawyer review the legal pages. They're a solid, accurate starting point that matches how the code handles data, but they aren't legal advice.

Keep the privacy policy in sync with `addon/appsscript.json`. Google's reviewers compare the scopes listed in the policy against the scopes the app requests.
