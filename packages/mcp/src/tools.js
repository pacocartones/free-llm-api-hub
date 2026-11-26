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
  return TRISTATE_FIELDS.filter((f) => typeof p[f] !== 'boolean');
}

/**
 * Why a tri-state flag is unconfirmed, from the dataset's field_checks (dataset 2.15.0 and later):
 * source_silent (the provider's pages were read and do not say it), needs_account (only an account would tell),
 * sources_disagree (two official pages contradict each other), stated (the canonical value is "conditional",
 * which the API projects to null), or not_checked (no check recorded). Older datasets have no field_checks,
 * so every unconfirmed flag reads not_checked.
 */
export const UNCONFIRMED_REASONS = ['source_silent', 'needs_account', 'sources_disagree', 'stated', 'not_checked'];
export function unconfirmedReason(p, field) {
  const c = p && p.field_checks && typeof p.field_checks === 'object' ? p.field_checks[field] : null;
  const status = c && typeof c === 'object' ? c.status : undefined;
  return UNCONFIRMED_REASONS.includes(status) ? status : 'not_checked';
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
  const excludedByReason = {};
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
      // Anything that is not an explicit boolean (null, a value added later such as "conditional") is unconfirmed.
      if (typeof value !== 'boolean') {
        excluded[param] = (excluded[param] ?? 0) + 1;
        const reason = unconfirmedReason(p, field);
        excludedByReason[param] = excludedByReason[param] ?? {};
        excludedByReason[param][reason] = (excludedByReason[param][reason] ?? 0) + 1;
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
    out.excluded_unconfirmed_by_reason = excludedByReason;
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
    unconfirmed_reasons: Object.fromEntries(unconfirmedFields(p).map((f) => [f, unconfirmedReason(p, f)])),
    dataset: { version: data.version, generated: data.generated },
    disclaimer: DISCLAIMER,
  };
}

/**
 * Why a provider is not in openai-clients.json, from its providers.json entry.
 * Null openai_compatible is reported as unconfirmed, never as "not compatible".
 */
function exclusionReasons(p) {
  const reasons = [];
  if (p.verified !== true) reasons.push("the entry is not verified against the provider's own docs (verified: false)");
  if (p.openai_compatible === false) reasons.push('the provider is not OpenAI-compatible (openai_compatible: false)');
  else if (p.openai_compatible !== true) reasons.push('OpenAI compatibility is not confirmed (openai_compatible: null)');
  if (!p.openai_base_url) reasons.push('no OpenAI-compatible base URL is recorded (openai_base_url: null)');
  return reasons;
}

/**
 * Client config from the published openai-clients.json (base_url, env_key,
 * models_free, docs_url, last_verified). `data` is providers.json, used to
 * resolve unknown slugs and to explain why a provider is not in the list.
 */
export function openaiClientConfig(data, clients, { slug, model }) {
  const p = findProvider(data, slug);
  const c = clients.clients.find((x) => x.slug === slug);
  if (!c) {
    const reasons = exclusionReasons(p);
    if (!reasons.length) {
      reasons.push(
        `it is not listed in openai-clients.json (clients ${clients.version ?? '?'} / ${clients.generated ?? '?'}, ` +
          `providers ${data.version ?? '?'} / ${data.generated ?? '?'}); the two files may come from different builds`,
      );
    }
    return {
      slug: p.slug,
      name: p.name,
      docs_url: p.docs_url,
      last_verified: p.last_verified ?? null,
      disclaimer: DISCLAIMER,
      available: false,
      reason: `No drop-in OpenAI client config for ${p.name}: ${reasons.join('; ')}. Follow the provider's own docs at ${p.docs_url || '(no docs_url recorded)'} for its API.`,
    };
  }

  const chatOnly = Array.isArray(p.modalities) && p.modalities.length > 0 && p.modalities.every((m) => m === 'text' || m === 'vision');
  if (p.is_text_llm !== true || !chatOnly) {
    return {
      slug: c.slug,
      name: c.name ?? c.slug,
      docs_url: c.docs_url,
      last_verified: c.last_verified ?? null,
      disclaimer: DISCLAIMER,
      available: true,
      base_url: c.base_url,
      env_var: c.env_key,
      snippet_note: 'No chat example: free text/chat access is unconfirmed or modalities are mixed/unknown. OpenAI compatibility and an untyped model sample do not identify the supported endpoint. Follow docs_url for the request format and model for this API.',
    };
  }

  const env = c.env_key;
  const url = c.base_url;
  const samples = Array.isArray(c.models_free) ? c.models_free : [];
  const chosen = model ?? samples[0] ?? '<model-id>';
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
    `const client = new OpenAI({ baseURL: ${JSON.stringify(url)}, apiKey: process.env[${JSON.stringify(env)}] });`,
    'const resp = await client.chat.completions.create({',
    `  model: ${JSON.stringify(chosen)},`,
    "  messages: [{ role: 'user', content: 'Hello' }],",
    '});',
    'console.log(resp.choices[0].message.content);',
  ].join('\n');

  const out = {
    slug: c.slug,
    name: c.name ?? c.slug,
    docs_url: c.docs_url,
    last_verified: c.last_verified ?? null,
    disclaimer: DISCLAIMER,
    available: true,
    base_url: url,
    env_var: env,
    env_var_note: 'Name of the environment variable for your own key, as published in openai-clients.json; any name works if you change the snippet. Get the key from the provider (see docs_url).',
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
      unconfirmed: Object.fromEntries(TRISTATE_FIELDS.map((f) => [f, by((p) => typeof p[f] !== 'boolean')])),
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

// ---------------------------------------------------------------------------
// Provider status (status.json) and the "Is <provider> free?" answer.
// ---------------------------------------------------------------------------

export const STATUS_NOTE =
  'freshness is graded at generated_at (the dataset day), not today: fresh = verified at most sla.due_after_days before it, ' +
  'due = up to sla.stale_after_days, stale = older (the SLA is breached), unverified = never verified. ' +
  'free_now is true for a verified entry whose last probe did not report the free tier gone, false when it reported ' +
  'tier-ended, null when not verified (not confirmed). It is not a live check. Regrade last_verified against your own today with sla.';

/**
 * Whether status.json and providers.json come from the same build. When both carry a version they must match;
 * a status file without a version (or a dataset without one) is accepted.
 */
function statusMatches(data, status) {
  if (!status || !data) return false;
  if (status.version == null || data.version == null) return true;
  return status.version === data.version;
}

/** The status entry of a slug, only when status.json belongs to the same build as providers.json. */
function statusEntry(data, status, slug) {
  if (!statusMatches(data, status)) return null;
  return Object.prototype.hasOwnProperty.call(status.providers, slug) ? status.providers[slug] : null;
}

function statusSource(status) {
  return { generated_at: status.generated_at, sla: status.sla };
}

/** searchProviders with the freshness grade of each result, when a matching status.json is available. */
export function searchProvidersWithStatus(data, args = {}, status = null) {
  const out = searchProviders(data, args);
  if (!statusMatches(data, status)) return out;
  let any = false;
  out.providers = out.providers.map((p) => {
    const e = statusEntry(data, status, p.slug);
    if (!e || e.freshness === null) return p;
    any = true;
    return { ...p, freshness: e.freshness };
  });
  if (any) out.freshness_source = statusSource(status);
  return out;
}

/** getProvider with the provider's freshness grade, when a matching status.json is available. */
export function getProviderWithStatus(data, args, status = null) {
  const out = getProvider(data, args);
  const e = statusEntry(data, status, out.provider.slug);
  if (!e || e.freshness === null) return out;
  return { ...out, freshness: e.freshness, freshness_source: statusSource(status) };
}

/** get_provider_status: one slug, or every provider when no slug is given. */
export function getProviderStatus(status, { slug } = {}) {
  const head = {
    generated_at: status.generated_at,
    sla: status.sla,
    schema_version: status.schema_version,
    version: status.version,
  };
  if (slug === undefined) {
    const counts = { fresh: 0, due: 0, stale: 0, unverified: 0 };
    let freeNow = 0;
    for (const e of Object.values(status.providers)) {
      if (e.freshness && e.freshness in counts) counts[e.freshness] += 1;
      if (e.free_now === true) freeNow += 1;
    }
    return {
      ...head,
      count: Object.keys(status.providers).length,
      counts: { ...counts, free_now: freeNow },
      providers: status.providers,
      note: STATUS_NOTE,
      disclaimer: DISCLAIMER,
    };
  }
  if (!Object.prototype.hasOwnProperty.call(status.providers, slug)) {
    const needle = String(slug ?? '').toLowerCase();
    const near = Object.keys(status.providers)
      .filter((s) => needle && (s.includes(needle) || needle.includes(s)))
      .slice(0, 5);
    const hint = near.length ? ` Did you mean: ${near.join(', ')}?` : ' Call get_provider_status without a slug to list every provider.';
    throw new ToolError(`Unknown provider slug "${slug}".${hint}`);
  }
  return { ...head, slug, ...status.providers[slug], note: STATUS_NOTE, disclaimer: DISCLAIMER };
}

// The site's own wording for provider pages (answer-first paragraph): a null field reads "not stated", never a guess.
export const NOT_STATED = 'not stated';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isIso = (d) => ISO_DAY.test(String(d || ''));
const httpUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
const noFinalStop = (s) => String(s ?? '').trim().replace(/[\s.;:,]+$/, '');
const stop = (s) => (/…$/.test(String(s)) ? '' : '.');

/** "2026-11-24" -> "24 Nov 2026"; anything else -> null. */
export function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

function compactNumber(n) {
  if (!Number.isInteger(n) || n < 0) return null;
  if (n < 10000) return n.toLocaleString('en-US');
  const [div, unit] = n >= 1e6 ? [1e6, 'M'] : [1e3, 'K'];
  const v = n / div;
  return `${Number.isInteger(v) ? v : Number(v.toFixed(1))}${unit}`;
}

const LIMIT_UNITS = [
  ['requests_per_second', (v) => `${v} RPS`],
  ['requests_per_minute', (v) => `${v} RPM`],
  ['requests_per_day', (v) => `${v} RPD`],
  ['requests_per_month', (v) => `${v} requests/month`],
  ['tokens_per_day', (v) => `${v} TPD`],
  ['tokens_per_month', (v) => `${v} tokens/month`],
];

/** The limit figures of a free_limits object, e.g. ["30 RPM", "1,000 RPD", "200K TPD"]. */
export function limitFigures(fl) {
  if (!fl || typeof fl !== 'object') return [];
  return LIMIT_UNITS.filter(([k]) => Number.isInteger(fl[k]) && fl[k] >= 0).map(([k, unit]) => unit(compactNumber(fl[k])));
}

function trimAtWord(text, max) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

const RENEWS = { 'renewing-quota': 'a quota that renews', 'recurring-credit': 'a credit that renews', perpetual: 'no end date' };

const FLAG_WORDS = {
  card_required: { true: 'required', false: 'not required' },
  phone_required: { true: 'required', false: 'not required' },
  commercial_ok: { true: 'allowed', false: 'not allowed (evaluation only)' },
};

/**
 * Whether commercial use is "conditional" in the canonical dataset. The /api/v1/ files publish that value as null and
 * keep its reason in commercial_ok_condition, which the dataset allows only for a conditional value.
 */
function commercialConditional(p) {
  if (p.commercial_ok === 'conditional') return true;
  if (p.commercial_ok !== null && p.commercial_ok !== undefined) return false;
  return (typeof p.commercial_ok_condition === 'string' && p.commercial_ok_condition.trim() !== '') ||
    unconfirmedReason(p, 'commercial_ok') === 'stated';
}

/** The words for a flag, as on the provider pages: "not stated" for null, "allowed with conditions" for conditional. */
function flagWords(p, field) {
  const v = p[field];
  if (typeof v === 'boolean') return FLAG_WORDS[field][String(v)];
  if (field === 'commercial_ok' && commercialConditional(p)) return 'allowed with conditions';
  return NOT_STATED;
}

/** The day (and page) a flag was read: its field check when recorded, else the entry's last verification. */
function flagSource(p, field) {
  const c = p.field_checks && typeof p.field_checks === 'object' ? p.field_checks[field] : null;
  if (c && typeof c === 'object' && isIso(c.checked)) {
    return { source_date: c.checked, source_url: httpUrl((c.sources || [])[0]) || httpUrl(p.docs_url) };
  }
  return { source_date: isIso(p.last_verified) ? p.last_verified : null, source_url: httpUrl(p.docs_url) };
}

/**
 * is_free: "Is <provider> API free?", answered with the same sentence as the provider page (answer-first paragraph),
 * plus each fact behind it with the day its source was read.
 */
export function isFree(data, { slug }, status = null) {
  const p = findProvider(data, slug);
  const figures = limitFigures(p.free_limits);
  const headline = figures.length
    ? { field: 'free_limits', text: figures.join(', ') }
    : p.free_tier
      ? { field: 'free_tier', text: noFinalStop(trimAtWord(p.free_tier, 140)) }
      : { field: 'free_tier', text: NOT_STATED };

  let first;
  let verdict;
  if (p.category === 'ongoing') {
    const renews = RENEWS[p.free_type];
    verdict = 'ongoing_free_tier';
    first = `Yes. ${p.name} has an ongoing free tier${renews ? ` (${renews})` : ''}: ${headline.text}${stop(headline.text)}`;
  } else if (p.category === 'trial') {
    verdict = 'trial_credit';
    const exp = p.expires ? `; the credit expires after ${noFinalStop(p.expires)}` : '';
    first = `Not permanently. ${p.name} gives a one-time trial credit, not an ongoing free tier: ${headline.text}${exp}${stop(exp || headline.text)}`;
  } else {
    verdict = NOT_STATED;
    first = `Whether ${p.name} has an ongoing free tier is ${NOT_STATED}: ${headline.text}${stop(headline.text)}`;
  }
  const card = flagWords(p, 'card_required');
  const phone = flagWords(p, 'phone_required');
  const comm = flagWords(p, 'commercial_ok');
  const verifiedText = p.verified === true && shortDate(p.last_verified) ? ` Verified ${shortDate(p.last_verified)}.` : ' Not verified yet.';
  const answer = `${first} Credit card: ${card}; phone verification: ${phone}; commercial use: ${comm}.${verifiedText}`;

  const offerDate = headline.field === 'free_limits' && isIso(p.free_limits.checked)
    ? p.free_limits.checked
    : isIso(p.last_verified) ? p.last_verified : null;
  const offerUrl = headline.field === 'free_limits' ? httpUrl(p.free_limits.source) || httpUrl(p.docs_url) : httpUrl(p.docs_url);
  const commercial = { field: 'commercial_ok', value: p.commercial_ok ?? null, words: comm, ...flagSource(p, 'commercial_ok') };
  if (comm === 'allowed with conditions' && p.commercial_ok_condition) commercial.condition = noFinalStop(p.commercial_ok_condition);
  const facts = [
    {
      field: 'category', value: p.category ?? null,
      words: verdict === 'ongoing_free_tier' ? 'ongoing free tier' : verdict === 'trial_credit' ? 'one-time trial credit' : NOT_STATED,
      source_date: isIso(p.last_verified) ? p.last_verified : null, source_url: httpUrl(p.docs_url),
    },
    { field: headline.field, value: headline.field === 'free_limits' ? p.free_limits : (p.free_tier ?? null), words: headline.text, source_date: offerDate, source_url: offerUrl },
    { field: 'card_required', value: p.card_required ?? null, words: card, ...flagSource(p, 'card_required') },
    { field: 'phone_required', value: p.phone_required ?? null, words: phone, ...flagSource(p, 'phone_required') },
    commercial,
  ];
  if (p.category === 'trial' && p.expires) {
    facts.splice(1, 0, { field: 'expires', value: p.expires, words: noFinalStop(p.expires), source_date: isIso(p.last_verified) ? p.last_verified : null, source_url: httpUrl(p.docs_url) });
  }

  const out = {
    slug: p.slug,
    name: p.name,
    question: `Is ${p.name} API free?`,
    answer,
    verdict,
    facts,
    verified: p.verified === true,
    last_verified: p.last_verified ?? null,
    docs_url: p.docs_url,
    page_url: `${String(data.homepage || 'https://freellmapihub.com/').replace(/\/+$/, '')}/p/${encodeURIComponent(p.slug)}`,
    dataset: { version: data.version, generated: data.generated },
    disclaimer: DISCLAIMER,
  };
  const e = statusEntry(data, status, p.slug);
  if (e) {
    if (e.freshness !== null) out.freshness = e.freshness;
    out.free_now = e.free_now;
    out.freshness_source = statusSource(status);
    if (e.free_now === false) {
      out.free_now_note = 'The last probe of this provider reported the free tier as ended (free_now: false); check docs_url before relying on the answer.';
    }
  }
  return out;
}
