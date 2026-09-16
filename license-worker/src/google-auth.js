// Verifies Google-issued OpenID Connect ID tokens (what Apps Script's ScriptApp.getIdentityToken() returns).

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const CLOCK_SKEW_SECONDS = 60;
const DEFAULT_JWKS_TTL_MS = 60 * 60 * 1000;

// Per-isolate cache of Google's signing keys, refreshed on expiry or when an unknown kid shows up.
let jwksCache = { keys: [], expiresAt: 0 };

export function resetJwksCache() {
  jwksCache = { keys: [], expiresAt: 0 };
}

export function base64UrlToBytes(input) {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '==='.slice(0, (4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function decodeJson(segment) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
}

async function getKeys(forceRefresh) {
  if (!forceRefresh && jwksCache.expiresAt > Date.now()) return jwksCache.keys;
  const response = await fetch(JWKS_URL);
  if (!response.ok) throw new Error(`JWKS fetch failed: ${response.status}`);
  const { keys } = await response.json();
  const maxAge = /max-age=(\d+)/.exec(response.headers.get('Cache-Control') || '');
  jwksCache = { keys, expiresAt: Date.now() + (maxAge ? Number(maxAge[1]) * 1000 : DEFAULT_JWKS_TTL_MS) };
  return keys;
}

/**
 * Returns { email } for a valid token whose audience is one of `audiences`; throws otherwise.
 */
export async function verifyGoogleIdToken(token, audiences, now = Date.now()) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = decodeJson(headerB64);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported token header');

  let jwk = (await getKeys(false)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await getKeys(true)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Unknown signing key');

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64UrlToBytes(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  if (!valid) throw new Error('Bad signature');

  const claims = decodeJson(payloadB64);
  const nowSeconds = Math.floor(now / 1000);
  if (!ISSUERS.has(claims.iss)) throw new Error('Bad issuer');
  if (!audiences.includes(claims.aud)) {
    // Only reached with a genuine Google signature, so this is a real OAuth client ID (not secret).
    const error = new Error('Bad audience');
    error.audience = claims.aud;
    throw error;
  }
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS < nowSeconds) throw new Error('Token expired');
  if (typeof claims.iat === 'number' && claims.iat - CLOCK_SKEW_SECONDS > nowSeconds) throw new Error('Token from the future');
  if (!claims.email || !(claims.email_verified === true || claims.email_verified === 'true')) {
    throw new Error('Token has no verified email');
  }
  return { email: claims.email.trim().toLowerCase() };
}
