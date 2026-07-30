// _serialize.mjs — the ONE canonical serializer for data/providers.json.
//
// Both fetch-models.mjs and probe.mjs write the dataset, so the exact byte
// format lives here to guarantee they never drift. Keys are emitted in ORDER;
// a key absent from a provider object is skipped (so newer fields stay optional
// and only appear where set). Arrays render inline. 2/4/6-space indentation.

// Canonical key order. New optional fields go at the logical tail; because the
// serializer skips absent keys, adding one here does not touch providers that
// don't have it yet.
export const ORDER = [
  'slug', 'name', 'category', 'free_type', 'free_tier', 'rate_limits', 'notes',
  'best_for', 'modalities', 'models_free', 'expires', 'docs_url', 'phone_required',
  'card_required', 'commercial_ok', 'openai_compatible', 'openai_base_url', 'env_key',
  'verified', 'last_verified', 'last_probed', 'probe_status',
];
export const TOP = ['$schema', 'version', 'generated', 'source', 'note'];

export function serialize(data) {
  const val = (v) =>
    Array.isArray(v) ? `[${v.map((x) => JSON.stringify(x)).join(', ')}]` : JSON.stringify(v);
  const provs = data.providers.map((p) => {
    const inner = ORDER.filter((k) => k in p)
      .map((k) => `      ${JSON.stringify(k)}: ${val(p[k])}`).join(',\n');
    return `    {\n${inner}\n    }`;
  });
  const top = TOP.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(data[k])},`);
  return `{\n${top.join('\n')}\n  "providers": [\n${provs.join(',\n')}\n  ]\n}\n`;
}

// Assert the serializer reproduces `raw` byte-for-byte; returns null on success
// or a short diagnostic string on failure.
export function roundTripError(raw) {
  const out = serialize(JSON.parse(raw));
  if (out === raw) return null;
  let i = 0;
  while (i < raw.length && raw[i] === out[i]) i++;
  return `first diff at byte ${i}\n  orig: ${JSON.stringify(raw.slice(i, i + 60))}\n  ours: ${JSON.stringify(out.slice(i, i + 60))}`;
}
