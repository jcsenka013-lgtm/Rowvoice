// Rowvoice license Worker.
//   GET  /api/check-license   -> { plan: "pro" | "free", status, currentPeriodEnd, cancelAtPeriodEnd, usage }
//   POST /api/usage           -> { month, used }   counts one invoice for this month
//   POST /api/portal          -> { url }           Stripe customer portal session
//   POST /api/webhook         Stripe webhook (checkout + subscription lifecycle)
//   GET  /health
// All /api routes except the webhook need Authorization: Bearer <Google ID token>.

import { verifyGoogleIdToken } from './google-auth.js';
import { verifyStripeSignature, handleStripeEvent } from './stripe.js';
import { getLicense, isProStatus, getUsage, incrementUsage } from './licenses.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function allowedAudiences(env) {
  return String(env.GOOGLE_CLIENT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

/** Returns { email } for a valid Google ID token, or { response } with the error to send. */
async function authenticate(request, env) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') || '');
  if (!match) return { response: json({ error: 'Missing bearer token' }, 401) };

  const audiences = allowedAudiences(env);
  if (audiences.length === 0) console.warn('GOOGLE_CLIENT_IDS is empty: every token is rejected until it is set');
  try {
    return await verifyGoogleIdToken(match[1], audiences);
  } catch (err) {
    console.warn('Rejected ID token:', err.message, err.audience || '');
    if (err.audience) await rememberUnrecognizedAudience(env, err.audience);
    return { response: json({ error: 'Invalid token' }, 401) };
  }
}

/**
 * Setup helper: remembers the audience of the last Google-signed token that wasn't allowed, so the
 * add-on's OAuth client ID can be read with
 *   npx wrangler kv key get --binding LICENSES --remote setup:unrecognized-audience
 * instead of being copied out of the Apps Script editor. Written only when it changes.
 */
async function rememberUnrecognizedAudience(env, audience) {
  const key = 'setup:unrecognized-audience';
  if ((await env.LICENSES.get(key)) === audience) return;
  await env.LICENSES.put(key, audience, { expirationTtl: 7 * 24 * 60 * 60 });
}

async function checkLicense(email, env) {
  const [license, usage] = await Promise.all([getLicense(env, email), getUsage(env, email)]);
  return json({
    plan: license && isProStatus(license.status) ? 'pro' : 'free',
    status: license ? license.status : null,
    currentPeriodEnd: license ? license.currentPeriodEnd ?? null : null,
    cancelAtPeriodEnd: license ? !!license.cancelAtPeriodEnd : false,
    usage
  });
}

async function billingPortal(email, env) {
  if (!env.STRIPE_SECRET_KEY || !env.PORTAL_RETURN_URL) {
    console.error('STRIPE_SECRET_KEY or PORTAL_RETURN_URL is not configured');
    return json({ error: 'Billing portal not configured' }, 500);
  }
  const license = await getLicense(env, email);
  if (!license || !license.customerId) return json({ error: 'No subscription for this account' }, 404);

  const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      customer: license.customerId,
      return_url: env.PORTAL_RETURN_URL,
      // Created by scripts/stripe-setup.mjs; without it Stripe uses the dashboard's default portal settings.
      ...(env.PORTAL_CONFIGURATION_ID ? { configuration: env.PORTAL_CONFIGURATION_ID } : {})
    })
  });
  const session = await response.json().catch(() => ({}));
  if (!response.ok || !session.url) {
    console.error('Stripe portal session failed:', response.status, session.error && session.error.message);
    return json({ error: 'Could not create billing session' }, 502);
  }
  return json({ url: session.url });
}

async function stripeWebhook(request, env) {
  const payload = await request.text();
  try {
    await verifyStripeSignature(payload, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.warn('Rejected webhook:', err.message);
    return json({ error: 'Invalid signature' }, 400);
  }

  const event = JSON.parse(payload);
  const outcome = await handleStripeEvent(event, env);
  console.log(JSON.stringify({ stripeEvent: event.id, type: event.type, outcome }));
  return json({ received: true, outcome });
}

const AUTHENTICATED_ROUTES = {
  'GET /api/check-license': (email, env) => checkLicense(email, env),
  'POST /api/usage': async (email, env) => json(await incrementUsage(env, email)),
  'POST /api/portal': (email, env) => billingPortal(email, env)
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const route = `${request.method} ${pathname}`;
    try {
      if (route === 'POST /api/webhook') return await stripeWebhook(request, env);
      if (pathname === '/health') return json({ ok: true });
      const handler = AUTHENTICATED_ROUTES[route];
      if (!handler) return json({ error: 'Not found' }, 404);
      const auth = await authenticate(request, env);
      if (auth.response) return auth.response;
      return await handler(auth.email, env);
    } catch (err) {
      // 500 on webhooks makes Stripe retry, which is what we want for transient KV errors.
      console.error('Unhandled error:', err && err.stack ? err.stack : err);
      return json({ error: 'Internal error' }, 500);
    }
  }
};
