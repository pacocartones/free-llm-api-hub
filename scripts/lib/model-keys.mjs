// model-keys.mjs — groups the per-provider free-model samples (`models_free`) by model, conservatively.
//
// The same model is listed under different deployment names: `openai/gpt-oss-120b` on one provider,
// `gpt-oss-120b` on another, `@cf/google/gemma-4-26b-a4b-it` on Cloudflare, `…:free` on OpenRouter.
// A key merges two IDs only when they are the same model under another deployment name; it never
// guesses. A different size, version, date, base/instruct suffix, quantisation or serving mode stays a
// separate key unless MODEL_ALIASES says otherwise (the same rule as model_tier_source.match: exact or
// a reviewed variant, never "close enough").
//
// Pure on purpose: build.mjs, the Lighthouse gate and the tests call the same functions.

export const MODEL_KEY_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
// /models/<key>/ shares the folder with /models/index.html; these names would read as something else.
export const RESERVED_MODEL_KEYS = Object.freeze(['index', 'page', 'api']);

/**
 * Reviewed by hand: `variant -> key`, both already lower-case and without prefixes. Each entry says why
 * the two names are the same model. A pair that only looks alike stays out of this table.
 */
export const MODEL_ALIASES = Object.freeze({
  // Cerebras writes the Qwen 3.8 27B release with a hyphen after "qwen"; Groq lists it as qwen/qwen3.8-27b.
  // Same family, same version, same size: only the spelling differs.
  'qwen-3.8-27b': 'qwen3.8-27b',
});

/** The ID without deployment prefix, OpenRouter's `:free` suffix or organisation prefix. Case is kept (for the display name). */
export function bareModelId(id) {
  let s = String(id ?? '').trim();
  s = s.replace(/^@cf\//, ''); // 1. deployment prefix (Cloudflare Workers AI)
  s = s.replace(/:free$/, ''); // 2. service suffix (OpenRouter)
  s = s.slice(s.lastIndexOf('/') + 1); // 3. organisation prefix: everything up to the last "/"
  return s;
}

/**
 * The grouping key of a model ID, or null when no safe key can be made. Steps, in order: strip the
 * deployment prefix, the `:free` suffix and the organisation prefix, lower-case, apply MODEL_ALIASES.
 * An ID whose result does not fit MODEL_KEY_RE (spaces, underscores, other characters) gets no page
 * rather than a rewritten one, and a reserved name gets none either.
 */
export function modelKey(id) {
  const lower = bareModelId(id).toLowerCase();
  const key = Object.hasOwn(MODEL_ALIASES, lower) ? MODEL_ALIASES[lower] : lower;
  if (!MODEL_KEY_RE.test(key) || RESERVED_MODEL_KEYS.includes(key)) return null;
  return key;
}

// Deterministic, locale-free order (the build must give the same bytes on every machine).
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The display name of a group: the most frequent bare ID among its entries, ties broken by plain
 * code-point order so the result never depends on the input order.
 */
export function displayName(ids) {
  const counts = new Map();
  for (const id of ids) { const b = bareModelId(id); counts.set(b, (counts.get(b) || 0) + 1); }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))[0]?.[0] ?? '';
}

/**
 * Groups every provider's `models_free` by modelKey: `[{ key, name, entries: [{ id, p }] }]`, sorted by key.
 * A provider appears once per group (the first ID it lists for that key). Providers without a sample, and
 * IDs that give no key, are skipped, so an empty dataset gives an empty list.
 */
export function groupModels(providers) {
  const byKey = new Map();
  for (const p of providers || []) {
    if (!Array.isArray(p?.models_free)) continue;
    for (const id of p.models_free) {
      if (typeof id !== 'string' || !id.trim()) continue;
      const key = modelKey(id);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, []);
      const entries = byKey.get(key);
      if (!entries.some((e) => e.p.slug === p.slug)) entries.push({ id, p });
    }
  }
  return [...byKey.entries()]
    .sort((a, b) => cmp(a[0], b[0]))
    .map(([key, entries]) => ({ key, name: displayName(entries.map((e) => e.id)), entries }));
}
