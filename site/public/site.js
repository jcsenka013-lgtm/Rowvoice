// Public Google Workspace Marketplace listing. Install buttons in the HTML already link here so they
// work without JavaScript; this keeps any [data-install] link in sync. Redeploy after changing it
// (cd site && npx wrangler deploy).
var MARKETPLACE_URL = 'https://workspace.google.com/marketplace/app/rowvoice/386477128189';

if (MARKETPLACE_URL) {
  document.querySelectorAll('[data-install]').forEach(function (link) {
    link.href = MARKETPLACE_URL;
    link.textContent = link.getAttribute('data-install');
  });
  document.querySelectorAll('[data-prelaunch]').forEach(function (el) { el.remove(); });
}
