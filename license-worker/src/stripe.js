// Stripe webhook signature verification and event handling. No Stripe SDK: Web Crypto only.

import { base64UrlToBytes } from './google-auth.js';
import { getLicense, linkCustomer, getCustomerEmail, putLicense, isProStatus } from './licenses.js';

const SIGNATURE_TOLERANCE_SECONDS = 300;

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signStripePayload(payload, secret, timestamp) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`)));
}

/** Throws unless `header` (the Stripe-Signature header) is a fresh, valid signature of `payload`. */
export async function verifyStripeSignature(payload, header, secret, now = Date.now()) {
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  let timestamp = null;
  const signatures = [];
  for (const part of String(header || '').split(',')) {
    const [name, value] = part.split('=', 2).map((s) => s && s.trim());
    if (name === 't') timestamp = Number(value);
    if (name === 'v1' && value) signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) throw new Error('Missing signature');
  if (Math.abs(Math.floor(now / 1000) - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    throw new Error('Signature timestamp outside tolerance');
  }
  const expected = await signStripePayload(payload, secret, timestamp);
  if (!signatures.some((sig) => timingSafeEqual(sig, expected))) throw new Error('Bad signature');
}

/** The add-on passes the Google account email as base64url in client_reference_id. */
export function emailFromReference(reference) {
  if (!reference) return null;
  try {
    const email = new TextDecoder().decode(base64UrlToBytes(reference));
    return /^[^@\s]+@[^@\s]+$/.test(email) ? email : null;
  } catch {
    return null;
  }
}

function subscriptionFields(sub) {
  const item = sub.items && sub.items.data && sub.items.data[0];
  return {
    subscriptionId: sub.id,
    customerId: sub.customer,
    // Newer Stripe API versions moved the period to the subscription item.
    currentPeriodEnd: sub.current_period_end ?? (item && item.current_period_end) ?? null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    interval: (item && item.price && item.price.recurring && item.price.recurring.interval) || null
  };
}

/** Applies one Stripe event to KV. Returns a short outcome string (logged, useful in tests). */
export async function handleStripeEvent(event, env) {
  const object = event.data && event.data.object;
  switch (event.type) {
    case 'checkout.session.completed': {
      if (object.mode !== 'subscription') return 'ignored: not a subscription checkout';
      const email =
        emailFromReference(object.client_reference_id) ||
        (object.customer_details && object.customer_details.email) ||
        object.customer_email;
      if (!email) return 'ignored: no email';
      const paid = object.payment_status === 'paid' || object.payment_status === 'no_payment_required';
      await linkCustomer(env, object.customer, email);
      return putLicense(env, email, event.created, {
        status: paid ? 'active' : 'incomplete',
        customerId: object.customer,
        subscriptionId: object.subscription
      });
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const email = await getCustomerEmail(env, object.customer);
      // Not linked yet: checkout.session.completed will create the license.
      if (!email) return 'ignored: unknown customer';
      const status = event.type === 'customer.subscription.deleted' ? 'canceled' : object.status;
      const existing = await getLicense(env, email);
      // A customer who switched plans: ending the old subscription must not revoke the new one.
      if (existing && existing.subscriptionId && existing.subscriptionId !== object.id &&
          isProStatus(existing.status) && !isProStatus(status)) {
        return 'ignored: other subscription is active';
      }
      return putLicense(env, email, event.created, { status, ...subscriptionFields(object) });
    }

    default:
      return `ignored: ${event.type}`;
  }
}
