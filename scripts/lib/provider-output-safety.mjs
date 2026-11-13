// Provider responses are untrusted even when the request went to a pinned host:
// a compromised endpoint can reflect its Authorization value into model IDs or
// headers that maintenance scripts publish. Keep the publication boundary here
// so every credential-bearing caller applies the same rules.

const MODEL_ID_RE = /^(?=.{1,200}$)[A-Za-z0-9@][A-Za-z0-9._+:/@-]*$/;
const RATE_LIMIT_RE = /^(?=.{1,128}$)(?=.*\d)[A-Za-z0-9-][A-Za-z0-9 .,:/+_=-]*$/;
const COMPACT_SECRET_MIN = 12;

export const RATE_LIMIT_HEADERS = [
  'x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests',
  'x-ratelimit-limit-tokens', 'x-ratelimit-remaining-tokens',
  'x-ratelimit-reset-requests', 'retry-after',
];

const unsafe = () => {
  // Deliberately omit the rejected value: this error is printed by callers.
  throw new UnsafeProviderOutputError('Unsafe provider response metadata was rejected');
};

export class UnsafeProviderOutputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeProviderOutputError';
  }
}

export function configuredCredentials(providers, env = process.env) {
  return [...new Set(providers
    .map((p) => p.env_key && env[p.env_key])
    .filter((value) => typeof value === 'string' && value.length > 0))];
}

function encodings(secret) {
  const bytes = Buffer.from(secret, 'utf8');
  const base64 = bytes.toString('base64');
  const base64url = bytes.toString('base64url');
  const percent = [...bytes].map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join('');
  return new Set([
    secret,
    JSON.stringify(secret).slice(1, -1),
    encodeURIComponent(secret),
    percent,
    percent.toUpperCase(),
    base64,
    base64.replace(/=+$/, ''),
    base64url,
    bytes.toString('hex'),
    bytes.toString('hex').toUpperCase(),
  ].filter(Boolean));
}

const compact = (value) => value.replace(/[^A-Za-z0-9]/g, '');

export function assertCredentialFree(value, credentials) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (typeof text !== 'string') return;
  const compactText = compact(text);
  const normalizedPercentText = text.replace(/%[0-9a-f]{2}/gi, (part) => part.toUpperCase());

  for (const credential of credentials) {
    const variants = encodings(credential);
    for (const encoded of variants) {
      if (text.includes(encoded)) unsafe();
      const compactEncoded = compact(encoded);
      if (compactEncoded.length >= COMPACT_SECRET_MIN && compactText.includes(compactEncoded)) unsafe();
    }
    const encodedUri = encodeURIComponent(credential).replace(/%[0-9a-f]{2}/gi, (part) => part.toUpperCase());
    const percent = [...Buffer.from(credential, 'utf8')]
      .map((byte) => `%${byte.toString(16).padStart(2, '0').toUpperCase()}`).join('');
    if (normalizedPercentText.includes(encodedUri) || normalizedPercentText.includes(percent)) unsafe();
    if (text.toLowerCase().includes(Buffer.from(credential, 'utf8').toString('hex'))) unsafe();
  }
}

export function safeModelIds(ids, credentials) {
  if (!Array.isArray(ids)) unsafe();
  for (const id of ids) {
    if (typeof id !== 'string') unsafe();
    assertCredentialFree(id, credentials);
    if (!MODEL_ID_RE.test(id)) unsafe();
  }
  // Joining also catches a credential split across adjacent response entries.
  assertCredentialFree(ids.join(''), credentials);
  return ids;
}

export function safeRateLimits(rateLimits, credentials) {
  if (!rateLimits || typeof rateLimits !== 'object' || Array.isArray(rateLimits)) unsafe();
  for (const [header, value] of Object.entries(rateLimits)) {
    if (!RATE_LIMIT_HEADERS.includes(header) || typeof value !== 'string') unsafe();
    assertCredentialFree(value, credentials);
    if (!RATE_LIMIT_RE.test(value)) unsafe();
  }
  // Joining also catches a credential split across multiple allowlisted headers.
  assertCredentialFree(Object.values(rateLimits).join(''), credentials);
  return rateLimits;
}
