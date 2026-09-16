// Creates (or finds) everything Rowvoice needs in Stripe, then stores the Worker secrets.
// Idempotent: objects are tagged with metadata and reused on re-runs.
//
//   STRIPE_API_KEY=sk_test_... node scripts/stripe-setup.mjs            # test mode
//   STRIPE_API_KEY=sk_live_... node scripts/stripe-setup.mjs            # live mode (asks nothing; be sure)
//   add --no-secrets to skip `wrangler secret put`
//
// Creates: product "Rowvoice Pro", $6/month + $49/year prices, one Payment Link per price, a webhook
// endpoint for https://api.rowvoice.com/api/webhook, and a customer portal configuration.
// Prints the Payment Link URLs (for addon/License.js UPGRADE_URLS) and the portal configuration ID
// (for PORTAL_CONFIGURATION_ID in wrangler.jsonc). Secrets are piped to wrangler, never printed.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = process.env.STRIPE_API_KEY;
if (!/^(sk|rk)_(test|live)_/.test(KEY || '')) throw new Error('Set STRIPE_API_KEY to a Stripe secret key (sk_test_… or sk_live_…).');
const MODE = KEY.includes('_live_') ? 'LIVE' : 'test';
const WRITE_SECRETS = !process.argv.includes('--no-secrets');
const workerDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const SITE = 'https://rowvoice.com';
const WEBHOOK_URL = 'https://api.rowvoice.com/api/webhook';
const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted'
];
const PLANS = [
  { key: 'monthly', lookupKey: 'rowvoice_pro_monthly', amount: 600, interval: 'month', nickname: 'Pro monthly' },
  { key: 'yearly', lookupKey: 'rowvoice_pro_yearly', amount: 4900, interval: 'year', nickname: 'Pro yearly' }
];

/** Stripe's form encoding: nested objects and arrays as key[sub][0]=value. */
function encode(params, prefix, out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const name = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => (typeof item === 'object' ? encode(item, `${name}[${i}]`, out) : out.append(`${name}[${i}]`, String(item))));
    } else if (typeof v === 'object') {
      encode(v, name, out);
    } else {
      out.append(name, String(v));
    }
  }
  return out;
}

async function stripe(method, path, params) {
  const query = method === 'GET' && params ? '?' + encode(params) : '';
  const res = await fetch(`https://api.stripe.com/v1${path}${query}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : encode(params || {})
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Stripe ${method} ${path}: ${body.error ? body.error.message : res.status}`);
  return body;
}

async function listAll(path, params = {}) {
  const items = [];
  let startingAfter;
  do {
    const page = await stripe('GET', path, { limit: 100, ...params, starting_after: startingAfter });
    items.push(...page.data);
    startingAfter = page.has_more ? page.data[page.data.length - 1].id : undefined;
  } while (startingAfter);
  return items;
}

function putSecret(name, value) {
  const wrangler = join(workerDir, 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler');
  const result = spawnSync(wrangler, ['secret', 'put', name], {
    cwd: workerDir, input: value, encoding: 'utf8', shell: process.platform === 'win32'
  });
  if (result.status !== 0) throw new Error(`wrangler secret put ${name} failed:\n${result.stderr || result.stdout}`);
  console.log(`  secret ${name} stored on the Worker`);
}

const account = await stripe('GET', '/account');
console.log(`Stripe account: ${account.settings?.dashboard?.display_name || account.id} (${MODE} mode)\n`);

// Product
let product = (await listAll('/products', { active: true })).find((p) => p.metadata.rowvoice === 'pro');
if (!product) {
  product = await stripe('POST', '/products', {
    name: 'Rowvoice Pro',
    description: 'Unlimited invoices, email invoices to clients, no Rowvoice footer.',
    url: SITE,
    metadata: { rowvoice: 'pro' }
  });
  console.log(`created product ${product.id}`);
} else console.log(`found product ${product.id}`);

// Prices
const existingPrices = (await stripe('GET', '/prices', { lookup_keys: PLANS.map((p) => p.lookupKey), active: true })).data;
const prices = {};
for (const plan of PLANS) {
  let price = existingPrices.find((p) => p.lookup_key === plan.lookupKey);
  if (!price) {
    price = await stripe('POST', '/prices', {
      product: product.id, currency: 'usd', unit_amount: plan.amount, nickname: plan.nickname,
      recurring: { interval: plan.interval }, lookup_key: plan.lookupKey, metadata: { rowvoice: `pro_${plan.key}` }
    });
    console.log(`created price ${price.id} (${plan.nickname})`);
  } else console.log(`found price ${price.id} (${plan.nickname})`);
  prices[plan.key] = price;
}

// Payment Links
const existingLinks = (await listAll('/payment_links', { active: true }));
const links = {};
for (const plan of PLANS) {
  let link = existingLinks.find((l) => l.metadata.rowvoice === `pro_${plan.key}`);
  if (!link) {
    link = await stripe('POST', '/payment_links', {
      line_items: [{ price: prices[plan.key].id, quantity: 1 }],
      allow_promotion_codes: true,
      after_completion: {
        type: 'hosted_confirmation',
        hosted_confirmation: {
          custom_message: 'You\'re on Rowvoice Pro. Go back to your spreadsheet, and in the Rowvoice sidebar click "Already upgraded? Refresh".'
        }
      },
      metadata: { rowvoice: `pro_${plan.key}` }
    });
    console.log(`created payment link (${plan.key})`);
  } else console.log(`found payment link (${plan.key})`);
  links[plan.key] = link.url;
}

// Webhook endpoint (its signing secret is only returned at creation)
let webhookSecret = null;
const existingHooks = await listAll('/webhook_endpoints');
let hook = existingHooks.find((h) => h.url === WEBHOOK_URL);
if (!hook) {
  hook = await stripe('POST', '/webhook_endpoints', {
    url: WEBHOOK_URL, enabled_events: WEBHOOK_EVENTS, description: 'Rowvoice license Worker', metadata: { rowvoice: 'license' }
  });
  webhookSecret = hook.secret;
  console.log(`created webhook endpoint ${hook.id}`);
} else {
  const missing = WEBHOOK_EVENTS.filter((e) => !hook.enabled_events.includes(e) && !hook.enabled_events.includes('*'));
  if (missing.length) {
    await stripe('POST', `/webhook_endpoints/${hook.id}`, { enabled_events: WEBHOOK_EVENTS });
    console.log(`updated webhook endpoint ${hook.id} events`);
  } else console.log(`found webhook endpoint ${hook.id} (existing signing secret is not retrievable; roll it in the dashboard if the Worker doesn't have it)`);
}

// Customer portal configuration
let portal = (await listAll('/billing_portal/configurations', { active: true })).find((c) => c.metadata?.rowvoice === 'portal');
if (!portal) {
  portal = await stripe('POST', '/billing_portal/configurations', {
    business_profile: { privacy_policy_url: `${SITE}/privacy`, terms_of_service_url: `${SITE}/terms`, headline: 'Manage your Rowvoice Pro subscription' },
    default_return_url: `${SITE}/`,
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ['email', 'address'] },
      subscription_cancel: { enabled: true, mode: 'at_period_end', cancellation_reason: { enabled: true, options: ['too_expensive', 'missing_features', 'unused', 'other'] } },
      subscription_update: {
        enabled: true, default_allowed_updates: ['price'], proration_behavior: 'create_prorations',
        products: [{ product: product.id, prices: [prices.monthly.id, prices.yearly.id] }]
      }
    },
    metadata: { rowvoice: 'portal' }
  });
  console.log(`created customer portal configuration ${portal.id}`);
} else console.log(`found customer portal configuration ${portal.id}`);

if (WRITE_SECRETS) {
  console.log('\nWorker secrets:');
  putSecret('STRIPE_SECRET_KEY', KEY);
  if (webhookSecret) putSecret('STRIPE_WEBHOOK_SECRET', webhookSecret);
}

console.log('\nUPGRADE_URLS (addon/License.js):');
console.log(JSON.stringify(links, null, 2));
console.log(`\nPORTAL_CONFIGURATION_ID (wrangler.jsonc vars): ${portal.id}`);
