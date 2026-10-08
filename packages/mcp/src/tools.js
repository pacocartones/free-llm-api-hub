// Tool logic, free of any MCP plumbing so it can be tested directly.
//
// Tri-state fields (phone_required, card_required, commercial_ok,
// openai_compatible) are true / false / null, and null means "not confirmed",
// never "no". Filters therefore match only explicitly confirmed values and
// report how many providers they left out because the value is unconfirmed.

export const DISCLAIMER =
  "Free-tier terms change without notice. The provider's own docs (docs_url) are authoritative; " +
  'last_verified is the date this entry was last checked against them. ' +
  'A null tri-state field means "not confirmed", not "no".';

export const TRISTATE_FIELDS = ['phone_required', 'card_required', 'commercial_ok', 'openai_compatible'];
export const MODALITIES = ['text', 'vision', 'image', 'audio', 'embeddings', 'rerank', 'ocr'];
export const CATEGORIES = ['ongoing', 'trial'];

export class ToolError extends Error {}

/** Human wording for a tri-state value. */
export function tristateLabel(value) {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return 'not confirmed';
}

function unconfirmedFields(p) {
  return TRISTATE_FIELDS.filter((f) => p[f] === null || p[f] === undefined);
}

function compact(p) {
  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    free_tier: p.free_tier,
    rate_limits: p.rate_limits ?? null,
    docs_url: p.docs_url,
    last_verified: p.last_verified ?? null,
    verified: p.verified === true,
  };
}

function haystack(p) {
  return [p.slug, p.name, p.free_tier, p.rate_limits, p.notes, p.best_for, ...(p.models_free ?? [])]
    .filter((s) => typeof s === 'string')
    .join('\n')
    .toLowerCase();
}

/**
 * Tri-state filters. Each one asks for an explicitly confirmed value of a field:
 *   no_card: true        -> card_required === false
 *   no_phone: true       -> phone_required === false
 *   commercial_ok: true  -> commercial_ok === true
 *   openai_compatible: true -> openai_compatible === true
 * and the inverse for `false`. A provider whose field is null is excluded and
 * counted under excluded_unconfirmed, because its answer is unknown.
 */
const TRISTATE_FILTERS = {
  no_card: { field: 'card_required', want: (v) => !v },
  no_phone: { field: 'phone_required', want: (v) => !v },
  commercial_ok: { field: 'commercial_ok', want: (v) => v },
  openai_compatible: { field: 'openai_compatible', want: (v) => v },
};

export function searchProviders(data, args = {}) {
  const { query, modality, category } = args;
  if (modality !== undefined && !MODALITIES.includes(modality)) {
    throw new ToolError(`Unknown modality "${modality}". Use one of: ${MODALITIES.join(', ')}.`);
  }
  if (category !== undefined && !CATEGORIES.includes(category)) {
    throw new ToolError(`Unknown category "${category}". Use one of: ${CATEGORIES.join(', ')}.`);
  }
  const tokens = typeof query === 'string' ? query.toLowerCase().split(/\s+/).filter(Boolean) : [];
  const excluded = {};
  const results = [];

  for (const p of data.providers) {
    if (category !== undefined && p.category !== category) continue;
    if (modality !== undefined && !(p.modalities ?? []).includes(modality)) continue;
    if (tokens.length) {
      const h = haystack(p);
      if (!tokens.every((t) => h.includes(t))) continue;
    }
    let keep = true;
    for (const [param, { field, want }] of Object.entries(TRISTATE_FILTERS)) {
      if (args[param] === undefined) continue;
      const value = p[field];
      if (value === null || value === undefined) {
        excluded[param] = (excluded[param] ?? 0) + 1;
        keep = false;
        break;
      }
      if (value !== want(args[param])) {
        keep = false;
        break;
      }
    }
    if (keep) results.push(compact(p));
  }

  const out = {
    count: results.length,
    providers: results,
    dataset: { version: data.version, generated: data.generated },
    disclaimer: DISCLAIMER,
  };
  if (Object.keys(excluded).length) {
    out.excluded_unconfirmed = excluded;
    out.excluded_note =
      'These providers were left out because the filtered field is null (not confirmed) for them. ' +
      'They may still qualify: check their docs_url.';
  }
  return out;
}

function findProvider(data, slug) {
  const p = data.providers.find((x) => x.slug === slug);
  if (!p) {
    const needle = String(slug ?? '').toLowerCase();
    const near = data.providers
      .filter((x) => needle && (x.slug.includes(needle) || needle.includes(x.slug) || x.name.toLowerCase().includes(needle)))
      .slice(0, 5)
      .map((x) => x.slug);
    const hint = near.length ? ` Did you mean: ${near.join(', ')}?` : ' Use search_providers to list slugs.';
    throw new ToolError(`Unknown provider slug "${slug}".${hint}`);
  }
  return p;
}

export function getProvider(data, { slug }) {
  const p = findProvider(data, slug);
  const flags = Object.fromEntries(TRISTATE_FIELDS.map((f) => [f, tristateLabel(p[f])]));
  return {
    provider: { ...p, docs_url: p.docs_url, last_verified: p.last_verified ?? null },
    flags,
    unconfirmed_fields: unconfirmedFields(p),
    dataset: { version: data.version, generated: data.generated },
    disclaimer: DISCLAIMER,
  };
}

/** Suggested environment variable name. The dataset does not publish one. */
export function envVarName(slug) {
  return `${slug.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`;
}

export function openaiClientConfig(data, { slug, model }) {
  const p = findProvider(data, slug);
  const base = {
    slug: p.slug,
    name: p.name,
    docs_url: p.docs_url,
    last_verified: p.last_verified ?? null,
    disclaimer: DISCLAIMER,
  };

  const reasons = [];
  if (p.verified !== true) reasons.push('the entry is not verified against the provider\'s own docs (verified: false)');
  if (p.openai_compatible === false) reasons.push('the provider is not OpenAI-compatible (openai_compatible: false)');
  else if (p.openai_compatible !== true) reasons.push('OpenAI compatibility is not confirmed (openai_compatible: null)');
  if (!p.openai_base_url) reasons.push('no OpenAI-compatible base URL is recorded (openai_base_url: null)');
  if (reasons.length) {
    return {
      ...base,
      available: false,
      reason: `No drop-in OpenAI client config for ${p.name}: ${reasons.join('; ')}. Follow the provider's own docs at ${p.docs_url || '(no docs_url recorded)'} for its API.`,
    };
  }

  const env = envVarName(p.slug);
  const samples = Array.isArray(p.models_free) ? p.models_free : [];
  const chosen = model ?? samples[0] ?? '<model-id>';
  const url = p.openai_base_url;
  const python = [
    'import os',
    'from openai import OpenAI',
    '',
    `client = OpenAI(base_url=${JSON.stringify(url)}, api_key=os.environ[${JSON.stringify(env)}])`,
    'resp = client.chat.completions.create(',
    `    model=${JSON.stringify(chosen)},`,
    '    messages=[{"role": "user", "content": "Hello"}],',
    ')',
    'print(resp.choices[0].message.content)',
  ].join('\n');
  const javascript = [
    "import OpenAI from 'openai';",
    '',
    `const client = new OpenAI({ baseURL: ${JSON.stringify(url)}, apiKey: process.env.${env} });`,
    'const resp = await client.chat.completions.create({',
    `  model: ${JSON.stringify(chosen)},`,
    "  messages: [{ role: 'user', content: 'Hello' }],",
    '});',
    'console.log(resp.choices[0].message.content);',
  ].join('\n');

  const out = {
    ...base,
    available: true,
    base_url: url,
    env_var: env,
    env_var_note: 'Suggested variable name for your key; any name works. Get the key from the provider (see docs_url).',
    model: chosen,
    python,
    javascript,
  };
  if (model === undefined) {
    out.model_note = samples.length
      ? `No model given: used the first sampled free model. models_free is a sample (${samples.join(', ')}) and may be out of date; check docs_url.`
      : 'No model given and the dataset has no sampled model IDs for this provider: replace <model-id> with one from the provider docs.';
  } else if (samples.length && !samples.includes(model)) {
    out.model_note = `"${model}" is not in the sampled free models (${samples.join(', ')}); the sample is partial, so confirm it in the provider docs.`;
  }
  return out;
}

function medianDate(dates) {
  if (!dates.length) return null;
  const sorted = [...dates].sort();
  // Lower median, so the answer is always a real date from the dataset.
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export function datasetInfo(data) {
  const ps = data.providers;
  const dated = ps.filter((p) => typeof p.last_verified === 'string');
  const dates = dated.map((p) => p.last_verified);
  const oldestDate = dates.length ? [...dates].sort()[0] : null;
  const oldest = dated
    .filter((p) => p.last_verified === oldestDate)
    .map((p) => ({ slug: p.slug, last_verified: p.last_verified, docs_url: p.docs_url }));
  const by = (fn) => ps.filter(fn).length;
  return {
    version: data.version,
    generated: data.generated,
    source: data.source,
    homepage: data.homepage,
    counts: {
      providers: ps.length,
      ongoing: by((p) => p.category === 'ongoing'),
      trial: by((p) => p.category === 'trial'),
      verified: by((p) => p.verified === true),
      unverified: by((p) => p.verified !== true),
      openai_client_ready: by((p) => p.verified === true && p.openai_compatible === true && !!p.openai_base_url),
      unconfirmed: Object.fromEntries(TRISTATE_FIELDS.map((f) => [f, by((p) => p[f] === null || p[f] === undefined)])),
    },
    freshness: {
      oldest_last_verified: oldestDate,
      median_last_verified: medianDate(dates),
      newest_last_verified: dates.length ? [...dates].sort().at(-1) : null,
      never_verified: ps.length - dated.length,
      oldest_providers: oldest,
    },
    disclaimer: DISCLAIMER,
  };
}
