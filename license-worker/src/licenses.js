// License storage in Workers KV.
//   license:<email>      -> { status, customerId, subscriptionId, currentPeriodEnd, ..., eventCreated, updatedAt }
//   customer:<stripe id> -> email
// KV is eventually consistent (changes can take up to ~60s to reach every location), which is fine
// for licensing; the add-on also caches the free plan for only a few minutes.

// past_due keeps Pro while Stripe retries the card; Stripe moves to unpaid/canceled when it gives up.
const PRO_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function isProStatus(status) {
  return PRO_STATUSES.has(status);
}

export function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

export async function getLicense(env, email) {
  return env.LICENSES.get(`license:${normalizeEmail(email)}`, 'json');
}

export async function getCustomerEmail(env, customerId) {
  return customerId ? env.LICENSES.get(`customer:${customerId}`) : null;
}

export async function linkCustomer(env, customerId, email) {
  if (customerId) await env.LICENSES.put(`customer:${customerId}`, normalizeEmail(email));
}

/**
 * Merges fields into the license, unless a newer Stripe event already wrote it
 * (Stripe doesn't guarantee delivery order, and retries can arrive late).
 */
export async function putLicense(env, email, eventCreated, fields) {
  const existing = await getLicense(env, email);
  if (existing && existing.eventCreated > eventCreated) return 'ignored: stale event';
  const license = {
    ...existing,
    ...fields,
    eventCreated,
    updatedAt: new Date().toISOString()
  };
  await env.LICENSES.put(`license:${normalizeEmail(email)}`, JSON.stringify(license));
  return `stored: ${license.status}`;
}

// Monthly invoice counts per Google account: usage:<email>:<YYYY-MM> -> number.
// KV has no atomic increment, so two invoices finishing at the same instant in different locations
// could count once. That's acceptable for a soft free-plan limit (the add-on also counts locally
// and uses the higher number); a Durable Object would be the upgrade path for exact counts.
const USAGE_TTL_SECONDS = 62 * 24 * 60 * 60;

export function currentMonth(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 7);
}

export async function getUsage(env, email, month = currentMonth()) {
  const used = Number(await env.LICENSES.get(`usage:${normalizeEmail(email)}:${month}`)) || 0;
  return { month, used };
}

export async function incrementUsage(env, email, month = currentMonth()) {
  const { used } = await getUsage(env, email, month);
  await env.LICENSES.put(`usage:${normalizeEmail(email)}:${month}`, String(used + 1), {
    expirationTtl: USAGE_TTL_SECONDS
  });
  return { month, used: used + 1 };
}
