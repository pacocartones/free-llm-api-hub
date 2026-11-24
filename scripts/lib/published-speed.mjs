// published-speed.mjs — speed figures a provider publishes for a model of its own API (data/schema.json, published_speed).
//
// The project does not measure speed (issue #606). What it records is the provider's own figure, with the provider's page, the day it
// was read and the provider's words, for a model of the provider's free sample (models_free). A figure is a claim made under the
// provider's own conditions: two providers' figures are not a benchmark, and no figure here says it applies to the free tier unless
// plan_named says so. An absent field means "not published or not recorded", never "slow".
import { hasHiddenChars } from './hidden-chars.mjs';
import { publicHttpsUrlError } from './public-fetch.mjs';
import { modelKey } from './model-keys.mjs';

export const SPEED_METRICS = Object.freeze({
  output_tokens_per_second: { unit: 'tokens/s', short: 'tok/s', label: 'output speed' },
  time_to_first_token_ms: { unit: 'ms', short: 'ms', label: 'time to first token' },
});
export const SPEED_QUALIFIERS = Object.freeze(['exact', 'approx', 'at_least', 'up_to']);
const QUALIFIER_SIGN = Object.freeze({ exact: '', approx: '~', at_least: '≥', up_to: '≤' });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// A figure the page attributes to someone else (a benchmark, a third party's test) is not the provider's own number.
export const THIRD_PARTY_RE = /artificial\s*analysis|according to|as (?:independently )?(?:tested|reported|measured|benchmarked) by|benchmarked by|third[- ]party/i;

/** The entries of a provider, or []. */
export function publishedSpeed(p) {
  return p && Array.isArray(p.published_speed) ? p.published_speed : [];
}

/** "~3,000 tok/s" — the figure as the site writes it; the sign says how the page words it. */
export function speedFigure(e) {
  const m = SPEED_METRICS[e && e.metric];
  if (!m || typeof e.value !== 'number') return '';
  return `${QUALIFIER_SIGN[e.qualifier] ?? ''}${e.value.toLocaleString('en-US')} ${m.short}`;
}

/** The registrable domain, by the last two labels (enough for the hosts the dataset holds). */
const siteOf = (u) => {
  try { return new URL(u).hostname.toLowerCase().split('.').slice(-2).join('.'); } catch { return null; }
};
/** The sites a provider's own pages live on: those of its docs, models list and OpenAI base URL. */
export function ownSites(p) {
  return new Set([p.docs_url, p.models_url, p.openai_base_url].map(siteOf).filter(Boolean));
}

// Each occurrence of the value as the page may write it ("3000", "3,000", "3k"), with the words around it.
function occurrences(quote, value) {
  const out = [];
  const re = /(\d[\d,]*(?:\.\d+)?)(\s*[kK]\b)?/g;
  let m;
  while ((m = re.exec(quote))) {
    const n = Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1);
    const prevChar = quote[m.index - 1] || '';
    const nextChar = quote[m.index + m[0].length] || '';
    // part of a name ("gpt-oss-120b", "v4.1", "-1017") or of a longer token
    if (/[\w.\-/]/.test(prevChar) || (!m[2] && /[A-Za-z]/.test(nextChar))) continue;
    if (n === value) out.push({ before: quote.slice(Math.max(0, m.index - 16), m.index), after: quote.slice(m.index + m[0].length, m.index + m[0].length + 2) });
  }
  return out;
}

/** The qualifier the provider's wording gives to an occurrence of the value. */
export function qualifierOf({ before, after }) {
  if (/(?:~|≈|\babout|\baround|\bapprox(?:imately|\.)?|\broughly)\s*$/i.test(before)) return 'approx';
  if (/(?:>|≥|\bmore than|\bover|\bat least|\babove)\s*$/i.test(before) || /^\+/.test(after)) return 'at_least';
  if (/(?:\bup to|<|≤)\s*$/i.test(before)) return 'up_to';
  return 'exact';
}

/** The validator rules of published_speed for one provider. @returns {string[]} */
export function publishedSpeedErrors(p, { today }) {
  const errors = [];
  const id = p.slug || p.name || '(unknown)';
  if (p.published_speed == null) return errors;
  if (!Array.isArray(p.published_speed) || p.published_speed.length === 0) return [`${id}: published_speed must be a non-empty list (leave it out when nothing is published)`];
  const sites = ownSites(p);
  const freeIds = new Set((p.models_free || []).map(String));
  const freeKeys = new Set((p.models_free || []).map(modelKey).filter(Boolean));
  const seen = new Set();
  p.published_speed.forEach((e, i) => {
    const where = `${id}: published_speed[${i}]`;
    if (!e || typeof e !== 'object') { errors.push(`${where} must be an object`); return; }
    const metric = SPEED_METRICS[e.metric];
    if (!metric) errors.push(`${where}.metric must be one of ${Object.keys(SPEED_METRICS).join(', ')}`);
    else if (e.unit !== metric.unit) errors.push(`${where}.unit must be "${metric.unit}" for ${e.metric}`);
    if (typeof e.model !== 'string' || !e.model.trim()) errors.push(`${where}.model must be the model ID as the provider writes it`);
    else if (!freeIds.has(e.model) && !(modelKey(e.model) && freeKeys.has(modelKey(e.model)))) {
      errors.push(`${where}: ${e.model} is not in models_free (a published speed is recorded only for a model of the free sample)`);
    }
    const key = `${e.model}\0${e.metric}`;
    if (seen.has(key)) errors.push(`${where}: a second ${e.metric} entry for ${e.model}`); seen.add(key);
    if (typeof e.value !== 'number' || !Number.isFinite(e.value) || e.value <= 0) errors.push(`${where}.value must be a positive number`);
    if (!SPEED_QUALIFIERS.includes(e.qualifier)) errors.push(`${where}.qualifier must be one of ${SPEED_QUALIFIERS.join(', ')}`);
    if (e.plan_named !== null && typeof e.plan_named !== 'boolean') errors.push(`${where}.plan_named must be true, false or null`);
    if (!DATE_RE.test(e.checked || '') || e.checked > today) errors.push(`${where}.checked must be a date not after today in UTC (${today})`);
    if (publicHttpsUrlError(e.source)) errors.push(`${where}.source must be the provider's public HTTPS page`);
    else if (hasHiddenChars(e.source)) errors.push(`${where}.source must not contain control, bidirectional or zero-width characters`);
    else if (!sites.has(siteOf(e.source))) errors.push(`${where}.source must be on the provider's own site (${[...sites].join(', ') || 'none recorded'}): a figure from a third party, an aggregator or a benchmark is never the cited source`);
    for (const [k, max] of [['quote', 300], ['conditions', 200]]) {
      if (e[k] == null) { if (k === 'quote') errors.push(`${where}.quote is required: the provider's words carrying the figure`); continue; }
      if (typeof e[k] !== 'string' || !e[k].trim() || e[k].length > max) errors.push(`${where}.${k} must be text of 1 to ${max} characters`);
      else if (hasHiddenChars(e[k])) errors.push(`${where}.${k} must not contain control, bidirectional or zero-width characters`);
    }
    if (typeof e.quote !== 'string' || typeof e.value !== 'number') return;
    if (THIRD_PARTY_RE.test(e.quote)) errors.push(`${where}.quote attributes the figure to someone else: only the provider's own figure is recorded`);
    const occ = occurrences(e.quote, e.value);
    if (!occ.length) errors.push(`${where}.quote must contain the figure ${e.value} as the page writes it (no rounding, no conversion)`);
    else if (SPEED_QUALIFIERS.includes(e.qualifier) && !occ.some((o) => qualifierOf(o) === e.qualifier)) {
      errors.push(`${where}.qualifier is ${e.qualifier} but the quote words the figure as ${qualifierOf(occ[0])}`);
    }
    // The model must be named by the quote or by its page (a per-model page carries the ID in its address).
    if (typeof e.model === 'string' && typeof e.source === 'string') {
      const m = e.model.toLowerCase();
      if (!e.quote.toLowerCase().includes(m) && !decodeURIComponent(e.source).toLowerCase().includes(m)) {
        errors.push(`${where}: neither the quote nor the source address names ${e.model}`);
      }
    }
  });
  return errors;
}

/** The register id of an entry's quote in data/quotes.json. */
export const speedQuoteId = (slug, e) => `${slug}.speed.${e.model}.${e.metric}`;

/**
 * The models that two or more providers publish an output speed for, each with its entries sorted by value (highest first).
 * Only figures worded as a sustained value count (exact, approx, at_least); an "up to" peak does not.
 * @returns {{key: string, rows: {provider: object, entry: object}[]}[]} most providers first, then by key
 */
export function sharedSpeedModels(providers) {
  const groups = new Map();
  for (const p of providers) {
    if (p.verified !== true) continue;
    for (const e of publishedSpeed(p)) {
      if (e.metric !== 'output_tokens_per_second' || e.qualifier === 'up_to') continue;
      const k = modelKey(e.model);
      if (!k) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ provider: p, entry: e });
    }
  }
  return [...groups.entries()]
    .map(([key, rows]) => ({ key, rows: rows.sort((a, b) => b.entry.value - a.entry.value || (a.provider.slug < b.provider.slug ? -1 : 1)) }))
    .filter((g) => new Set(g.rows.map((r) => r.provider.slug)).size >= 2)
    .sort((a, b) => b.rows.length - a.rows.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

const SITE = 'https://freellmapihub.com';

/**
 * The README TL;DR row about speed, made from the data (readme-tldr.test.mjs requires the README to carry exactly this line).
 * With a model that two providers publish a figure for, it names the two highest recorded figures for that model, each as that provider's
 * claim; otherwise it names who publishes per-model figures, without comparing. It never says "fastest": a vendor figure is not
 * a measurement, and no figure here is stated for the free tier.
 */
export function speedTldrRow(providers) {
  const link = (p) => `[${p.name}](${SITE}/p/${p.slug})`;
  const [top] = sharedSpeedModels(providers);
  if (top) {
    const [a, b] = top.rows;
    const model = a.entry.model.slice(a.entry.model.lastIndexOf('/') + 1);
    const freeTier = [a, b].some((r) => r.entry.plan_named === true) ? 'check each page for the plan it covers' : 'neither says it applies to the free tier';
    return `| **Published speed figures** | ${link(a.provider)} or ${link(b.provider)} | Each provider's own figure for ${model}: ${speedFigure(a.entry)} (${a.provider.name}), ${speedFigure(b.entry)} (${b.provider.name}). Provider claims, not our measurement; ${freeTier} |`;
  }
  const publishers = providers.filter((p) => p.verified === true && publishedSpeed(p).length).sort((x, y) => (x.slug < y.slug ? -1 : 1));
  if (!publishers.length) return null;
  return `| **Published per-model speeds** | ${publishers.slice(0, 3).map(link).join(', ')} | These providers publish a speed for models of their free sample. Provider claims, not our measurement, and not comparable across providers |`;
}
