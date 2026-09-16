/**
 * Plan, usage limits and billing.
 *
 * The plan comes from the license Worker (license-worker/). The add-on authenticates with the user's
 * Google ID token (ScriptApp.getIdentityToken(), needs the openid scope) instead of passing a bare
 * ?email=, so nobody can look up whether an arbitrary address is a paying customer.
 *
 * Usage is counted twice: locally (UserProperties, works offline) and on the Worker, per Google
 * account per month. The higher count wins, so clearing script data doesn't reset the free limit.
 *
 * To go live:
 *   1. Deploy the Worker (served at https://api.rowvoice.com), then set LICENSE_API_BASE below.
 *      It stays blank until then so testing isn't slowed by calls to a server that doesn't exist yet.
 *   2. appsscript.json already allows https://api.rowvoice.com/ in urlFetchWhitelist.
 *   3. Run debugIdentityToken() once from the editor and put the logged "aud" into the Worker's
 *      GOOGLE_CLIENT_IDS var.
 *   4. Set UPGRADE_URLS to the two Stripe Payment Links.
 */

var FREE_MONTHLY_LIMIT = 5;
var LICENSE_API_BASE = ''; // 'https://api.rowvoice.com' once the license Worker is deployed
var UPGRADE_URLS = { monthly: '', yearly: '' };
var EMAIL_IS_PRO_FEATURE = true;

var PRO_CACHE_SECONDS = 6 * 60 * 60;
var FREE_CACHE_SECONDS = 10 * 60; // short, so a fresh upgrade shows up quickly
var PRO_GRACE_MS = 3 * 24 * 60 * 60 * 1000; // keep Pro working if the license server is briefly down

/** Calls the license Worker. Returns parsed JSON; throws on network or non-200 responses. */
function licenseApi_(path, method) {
  var token = ScriptApp.getIdentityToken();
  if (!token) throw new Error('No identity token (is the openid scope in appsscript.json?)');
  var response = UrlFetchApp.fetch(LICENSE_API_BASE + path, {
    method: method || 'get',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  var body = {};
  try {
    body = JSON.parse(response.getContentText());
  } catch (err) {
    // non-JSON error page
  }
  if (response.getResponseCode() !== 200) {
    var error = new Error(body.error || 'License server returned ' + response.getResponseCode());
    error.status = response.getResponseCode();
    throw error;
  }
  return body;
}

function getPlan_(forceRefresh) {
  if (!LICENSE_API_BASE) return 'free';
  var cache = CacheService.getUserCache();
  if (!forceRefresh) {
    var cached = cache.get('plan');
    if (cached) return cached;
  }

  var props = PropertiesService.getUserProperties();
  var plan;
  try {
    var license = licenseApi_('/api/check-license');
    plan = license.plan === 'pro' ? 'pro' : 'free';
    if (license.usage) rememberServerUsage_(license.usage);
  } catch (err) {
    console.warn('License check failed: ' + err.message);
    // Don't cache failures, so the next call retries. Recent Pro users keep Pro meanwhile.
    var lastProAt = Number(props.getProperty('lastProAt') || 0);
    return Date.now() - lastProAt < PRO_GRACE_MS ? 'pro' : 'free';
  }

  if (plan === 'pro') props.setProperty('lastProAt', String(Date.now()));
  else props.deleteProperty('lastProAt');
  cache.put('plan', plan, plan === 'pro' ? PRO_CACHE_SECONDS : FREE_CACHE_SECONDS);
  return plan;
}

function currentMonth_() {
  return Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM');
}

function usageKey_() {
  return 'usage_' + currentMonth_();
}

/** Keeps the Worker's count for this month (if it's for this month) in UserProperties. */
function rememberServerUsage_(usage) {
  if (!usage || usage.month !== currentMonth_()) return;
  var props = PropertiesService.getUserProperties();
  var key = 'serverUsage_' + usage.month;
  if (Number(usage.used) > Number(props.getProperty(key) || 0)) props.setProperty(key, String(usage.used));
}

function getUsage() {
  var plan = getPlan_();
  var props = PropertiesService.getUserProperties();
  var used = Math.max(
    Number(props.getProperty(usageKey_()) || 0),
    Number(props.getProperty('serverUsage_' + currentMonth_()) || 0)
  );
  return {
    plan: plan,
    used: used,
    limit: plan === 'pro' ? null : FREE_MONTHLY_LIMIT,
    upgrade: plan === 'pro' ? null : upgradeLinks_(),
    canEmail: plan === 'pro' || !EMAIL_IS_PRO_FEATURE,
    licensingEnabled: !!LICENSE_API_BASE
  };
}

/** Sidebar "Already upgraded? Refresh": skip the cached plan. */
function refreshPlan() {
  getPlan_(true);
  return getUsage();
}

/**
 * Payment Links carrying the Google account, so the purchase is credited to the account that uses
 * the add-on even if the buyer types a different email at checkout. client_reference_id only allows
 * [A-Za-z0-9_-], hence base64url. The Worker decodes it in the checkout.session.completed webhook.
 */
function upgradeLinks_() {
  var email = Session.getEffectiveUser().getEmail();
  var links = {};
  Object.keys(UPGRADE_URLS).forEach(function (key) {
    var url = UPGRADE_URLS[key];
    if (!url) return;
    if (email) {
      url += (url.indexOf('?') === -1 ? '?' : '&') +
        'prefilled_email=' + encodeURIComponent(email) +
        '&client_reference_id=' + Utilities.base64EncodeWebSafe(email).replace(/=+$/, '');
    }
    links[key] = url;
  });
  return links;
}

/** Sidebar "Manage billing": a one-time Stripe customer portal link (cancel, change plan, invoices). */
function getBillingPortalUrl() {
  if (!LICENSE_API_BASE) throw new Error('Billing is not set up yet.');
  try {
    return licenseApi_('/api/portal', 'post').url;
  } catch (err) {
    if (err.status === 404) throw new Error('No subscription found for this Google account.');
    throw new Error('Could not open billing right now. Please try again in a minute.');
  }
}

function checkCanGenerate_() {
  var usage = getUsage();
  if (usage.limit !== null && usage.used >= usage.limit) {
    var err = new Error(
      'Free plan limit reached (' + usage.limit + ' invoices this month). Upgrade to Pro for unlimited invoices.'
    );
    err.limitReached = true;
    throw err;
  }
  return usage;
}

/** Counts one invoice. Callers must hold the user lock. The server count is best effort. */
function recordUsage_() {
  var props = PropertiesService.getUserProperties();
  var key = usageKey_();
  props.setProperty(key, String(Number(props.getProperty(key) || 0) + 1));
  if (!LICENSE_API_BASE) return;
  try {
    rememberServerUsage_(licenseApi_('/api/usage', 'post'));
  } catch (err) {
    console.warn('Usage sync failed: ' + err.message);
  }
}

/** Run once from the Apps Script editor to find the audience (OAuth client ID) for the Worker config. */
function debugIdentityToken() {
  var token = ScriptApp.getIdentityToken();
  if (!token) throw new Error('No identity token. Add "openid" to oauthScopes and re-authorize.');
  var segment = token.split('.')[1];
  segment += '==='.slice(0, (4 - segment.length % 4) % 4);
  var payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(segment)).getDataAsString());
  console.log('aud (put in GOOGLE_CLIENT_IDS): ' + payload.aud + '\nemail: ' + payload.email);
}
