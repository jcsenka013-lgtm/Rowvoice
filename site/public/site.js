// Launch switch. Set this to the Google Workspace Marketplace listing URL when the add-on is public,
// then redeploy (cd site && npx wrangler deploy). Until then, install buttons collect launch
// notifications by email and "launching soon" labels are shown.
var MARKETPLACE_URL = '';

if (MARKETPLACE_URL) {
  document.querySelectorAll('[data-install]').forEach(function (link) {
    link.href = MARKETPLACE_URL;
    link.textContent = link.getAttribute('data-install');
  });
  document.querySelectorAll('[data-prelaunch]').forEach(function (el) { el.remove(); });
}
