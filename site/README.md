# Rowvoice site

A static landing page, privacy policy and terms. It has no build step: plain HTML and CSS in `public/`, served as Cloudflare Workers static assets.

```sh
npx wrangler dev      # http://localhost:8787
npx wrangler deploy
```

Deploying attaches rowvoice.com and www.rowvoice.com, which are set as custom domains in wrangler.jsonc. Google's OAuth verification requires the privacy policy and terms to be on a domain you've verified in Search Console.

## Before publishing

Search `public/` for these placeholders and replace them all:

| Placeholder | Replace with |
| --- | --- |
| `MARKETPLACE_URL` in `public/site.js` | Google Workspace Marketplace listing URL. Until it's set, install buttons are "Notify me" email links and "launching soon" shows. |
| ~~`CONTACT_EMAIL`~~ | Done: `support@rowvoice.com`. Set up Cloudflare Email Routing so it reaches you, and use the same address on the OAuth consent screen. |
| `<mark class="todo">` blocks | Legal name, postal address, refund policy, governing law |

Have a lawyer review the legal pages. They're a solid, accurate starting point that matches how the code handles data, but they aren't legal advice.

Keep the privacy policy in sync with `addon/appsscript.json`. Google's reviewers compare the scopes listed in the policy against the scopes the app requests.
