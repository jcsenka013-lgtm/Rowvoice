# Rowvoice site

A static landing page, privacy policy and terms. It has no build step: plain HTML and CSS in `public/`, served as Cloudflare Workers static assets.

```sh
npx wrangler dev      # http://localhost:8787
npx wrangler deploy
```

Deploying attaches rowvoice.com and www.rowvoice.com, which are set as custom domains in wrangler.jsonc. Google's OAuth verification requires the privacy policy and terms to be on a domain you've verified in Search Console.

## Launch status

| Item | Status |
| --- | --- |
| `MARKETPLACE_URL` in `public/site.js` | Set to the public listing, https://workspace.google.com/marketplace/app/rowvoice/386477128189. Install buttons in the HTML link there directly. |
| Contact email | `support@rowvoice.com` on the site and on the OAuth consent screen. Route that inbox with Cloudflare Email Routing. |
| Legal pages | Name CAPTURES BY JC LLC, Oklahoma law, the refund policy, and the support email. Have a lawyer review them before you rely on them. They match how the code handles data; they are not legal advice. |

Keep the privacy policy in sync with `addon/appsscript.json`. Google's reviewers compare the scopes listed in the policy against the scopes the app requests.
