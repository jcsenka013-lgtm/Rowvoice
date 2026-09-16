import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { resetJwksCache } from '../src/google-auth.js';
import { signStripePayload, emailFromReference } from '../src/stripe.js';

const AUDIENCE = 'test-client.apps.googleusercontent.com';
const WEBHOOK_SECRET = 'whsec_test';

function memoryKv() {
  const store = new Map();
  return {
    store,
    async get(key, type) {
      const value = store.has(key) ? store.get(key) : null;
      return value !== null && type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value, options) { store.set(key, value); if (options) this.lastOptions = options; }
  };
}

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

// One RSA key pair for the whole run, served as Google's JWKS through a stubbed fetch.
const keyPair = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify']
);
const publicJwk = { ...(await crypto.subtle.exportKey('jwk', keyPair.publicKey)), kid: 'kid-1' };
let jwksFetches = 0;
let stripeRequests = [];
let stripeResponse = { status: 200, body: { url: 'https://billing.stripe.test/session' } };
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.stripe.com/')) {
    stripeRequests.push({ url: String(url), init });
    return new Response(JSON.stringify(stripeResponse.body), { status: stripeResponse.status });
  }
  jwksFetches++;
  return new Response(JSON.stringify({ keys: [publicJwk] }), { headers: { 'Cache-Control': 'max-age=3600' } });
};

async function idToken(claims, { kid = 'kid-1', privateKey = keyPair.privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: 'https://accounts.google.com', aud: AUDIENCE, email: 'User@Example.com', email_verified: true,
    iat: now, exp: now + 3600, ...claims
  }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`;
}

let env;
beforeEach(() => {
  resetJwksCache();
  env = {
    LICENSES: memoryKv(), GOOGLE_CLIENT_IDS: AUDIENCE, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_SECRET_KEY: 'sk_test_x', PORTAL_RETURN_URL: 'https://site.test/'
  };
  stripeRequests = [];
  stripeResponse = { status: 200, body: { url: 'https://billing.stripe.test/session' } };
});

async function checkLicense(token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await worker.fetch(new Request('https://w.test/api/check-license', { headers }), env);
  return { status: res.status, body: await res.json() };
}

let eventSeq = 0;
async function sendEvent(type, object, created = Math.floor(Date.now() / 1000)) {
  const payload = JSON.stringify({ id: `evt_${++eventSeq}`, type, created, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const signature = await signStripePayload(payload, WEBHOOK_SECRET, t);
  const res = await worker.fetch(new Request('https://w.test/api/webhook', {
    method: 'POST', body: payload, headers: { 'Stripe-Signature': `t=${t},v1=${signature}` }
  }), env);
  return { status: res.status, body: await res.json() };
}

const checkout = (overrides = {}) => ({
  mode: 'subscription', payment_status: 'paid', customer: 'cus_1', subscription: 'sub_1',
  client_reference_id: Buffer.from('user@example.com').toString('base64url'),
  customer_details: { email: 'different-billing@example.com' }, ...overrides
});

test('check-license: free for unknown users, pro after checkout', async () => {
  assert.deepEqual((await checkLicense(await idToken())).body.plan, 'free');
  assert.equal((await sendEvent('checkout.session.completed', checkout())).status, 200);
  const { status, body } = await checkLicense(await idToken());
  assert.equal(status, 200);
  assert.equal(body.plan, 'pro');
});

test('check-license: rejects missing, forged, wrong-audience, expired and unverified tokens', async () => {
  assert.equal((await checkLicense(null)).status, 401);
  const otherKeys = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']
  );
  assert.equal((await checkLicense(await idToken({}, { privateKey: otherKeys.privateKey }))).status, 401);
  assert.equal((await checkLicense(await idToken({ aud: 'someone-else' }))).status, 401);
  assert.equal((await checkLicense(await idToken({ exp: Math.floor(Date.now() / 1000) - 600 }))).status, 401);
  assert.equal((await checkLicense(await idToken({ email_verified: false }))).status, 401);
  assert.equal((await checkLicense(await idToken({}, { kid: 'unknown' }))).status, 401);
});

test('check-license: fails closed when no audience is configured, and records the audience for setup', async () => {
  env.GOOGLE_CLIENT_IDS = '';
  assert.equal((await checkLicense(await idToken({ aud: 'addon-client.apps.googleusercontent.com' }))).status, 401);
  assert.equal(env.LICENSES.store.get('setup:unrecognized-audience'), 'addon-client.apps.googleusercontent.com');
});

test('forged tokens never write the setup audience', async () => {
  const otherKeys = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']
  );
  await checkLicense(await idToken({ aud: 'attacker' }, { privateKey: otherKeys.privateKey }));
  assert.equal(env.LICENSES.store.has('setup:unrecognized-audience'), false);
});

test('JWKS is cached between requests', async () => {
  const before = jwksFetches;
  await checkLicense(await idToken());
  await checkLicense(await idToken());
  assert.equal(jwksFetches - before, 1);
});

test('webhook: rejects bad and stale signatures', async () => {
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: checkout() } });
  const post = (header) => worker.fetch(new Request('https://w.test/api/webhook', {
    method: 'POST', body: payload, headers: header ? { 'Stripe-Signature': header } : {}
  }), env);
  const now = Math.floor(Date.now() / 1000);
  assert.equal((await post(null)).status, 400);
  assert.equal((await post(`t=${now},v1=deadbeef`)).status, 400);
  const old = now - 3600;
  assert.equal((await post(`t=${old},v1=${await signStripePayload(payload, WEBHOOK_SECRET, old)}`)).status, 400);
  assert.equal(env.LICENSES.store.size, 0);
});

test('webhook: client_reference_id wins over the billing email', async () => {
  await sendEvent('checkout.session.completed', checkout());
  assert.ok(env.LICENSES.store.has('license:user@example.com'));
  assert.ok(!env.LICENSES.store.has('license:different-billing@example.com'));
  assert.equal(emailFromReference('not base64 !!'), null);
});

test('webhook: cancellation downgrades, stale events are ignored', async () => {
  const t0 = 1_800_000_000;
  await sendEvent('checkout.session.completed', checkout(), t0);
  await sendEvent('customer.subscription.deleted', { id: 'sub_1', customer: 'cus_1', status: 'canceled' }, t0 + 100);
  // A retried, older "updated: active" event arrives late.
  const late = await sendEvent('customer.subscription.updated', { id: 'sub_1', customer: 'cus_1', status: 'active' }, t0 + 50);
  assert.equal(late.body.outcome, 'ignored: stale event');
  assert.equal((await checkLicense(await idToken())).body.plan, 'free');
});

test('webhook: past_due keeps pro; period end comes from the item on new API versions', async () => {
  const t0 = 1_800_000_000;
  await sendEvent('checkout.session.completed', checkout(), t0);
  await sendEvent('customer.subscription.updated', {
    id: 'sub_1', customer: 'cus_1', status: 'past_due',
    items: { data: [{ current_period_end: 1_900_000_000, price: { recurring: { interval: 'year' } } }] }
  }, t0 + 10);
  const { body } = await checkLicense(await idToken());
  assert.equal(body.plan, 'pro');
  assert.equal(body.currentPeriodEnd, 1_900_000_000);
});

test('webhook: ending an old subscription does not revoke a newer active one', async () => {
  const t0 = 1_800_000_000;
  await sendEvent('checkout.session.completed', checkout({ subscription: 'sub_new' }), t0);
  const res = await sendEvent('customer.subscription.deleted', { id: 'sub_old', customer: 'cus_1', status: 'canceled' }, t0 + 10);
  assert.equal(res.body.outcome, 'ignored: other subscription is active');
  assert.equal((await checkLicense(await idToken())).body.plan, 'pro');
});

test('webhook: events for unknown customers and other types are acknowledged and ignored', async () => {
  const res = await sendEvent('customer.subscription.updated', { id: 'sub_x', customer: 'cus_x', status: 'active' });
  assert.equal(res.status, 200);
  assert.equal(res.body.outcome, 'ignored: unknown customer');
  assert.equal((await sendEvent('invoice.paid', {})).body.outcome, 'ignored: invoice.paid');
});

test('unknown routes 404', async () => {
  assert.equal((await worker.fetch(new Request('https://w.test/nope'), env)).status, 404);
});

async function post(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await worker.fetch(new Request(`https://w.test${path}`, { method: 'POST', headers }), env);
  return { status: res.status, body: await res.json() };
}

test('usage: counts per account per month, reported by check-license, requires a token', async () => {
  assert.equal((await post('/api/usage', null)).status, 401);
  const token = await idToken();
  assert.equal((await post('/api/usage', token)).body.used, 1);
  const second = await post('/api/usage', token);
  assert.equal(second.body.used, 2);
  assert.match(second.body.month, /^[0-9]{4}-[0-9]{2}$/);
  assert.ok(env.LICENSES.lastOptions.expirationTtl > 31 * 24 * 3600, 'usage keys expire after the month');
  assert.deepEqual((await checkLicense(token)).body.usage, second.body);
  // Another account starts from zero.
  assert.equal((await post('/api/usage', await idToken({ email: 'other@example.com' }))).body.used, 1);
});

test('portal: 404 without a subscription, session URL with one', async () => {
  const token = await idToken();
  assert.equal((await post('/api/portal', token)).status, 404);
  await sendEvent('checkout.session.completed', checkout());
  const { status, body } = await post('/api/portal', token);
  assert.equal(status, 200);
  assert.equal(body.url, 'https://billing.stripe.test/session');
  const sent = new URLSearchParams(String(stripeRequests[0].init.body));
  assert.equal(sent.get('customer'), 'cus_1');
  assert.equal(sent.get('return_url'), 'https://site.test/');
  assert.equal(stripeRequests[0].init.headers.Authorization, 'Bearer sk_test_x');
});

test('portal: 502 when Stripe fails, 500 when not configured', async () => {
  await sendEvent('checkout.session.completed', checkout());
  stripeResponse = { status: 400, body: { error: { message: 'No configuration' } } };
  assert.equal((await post('/api/portal', await idToken())).status, 502);
  delete env.STRIPE_SECRET_KEY;
  assert.equal((await post('/api/portal', await idToken())).status, 500);
});

test('GET on POST-only routes is 404', async () => {
  assert.equal((await worker.fetch(new Request('https://w.test/api/usage'), env)).status, 404);
});
