// find.mjs — the "Find my free API" wizard (/find/): its questions, the filter each answer applies, the shareable URL
// hash, the matching explorer link, the data the page inlines and the markup of one result.
//
// Two audiences, one module (the same contract as rows.mjs / sort.mjs):
//   - scripts/build.mjs renders the page (questions, no-JS fallback) and inlines findPayload() as its data;
//   - site/find.js runs the generated site/shared-find.js (clientBundle() below), so the browser and the tests execute
//     the same code.
//
// No ranking of its own. The order is recommendedCmp from rules.mjs (window.FLLM_RULES, the explorer's "Recommended"
// order), and every constraint is the explorer's own filter chip, word for word (site/explorer.js render()): a provider
// matches only when the field holds the confirmed value. A null ("not confirmed") never counts as yes. Providers that
// would match except for a field that is not confirmed are returned apart (`possible`), never mixed into the matches,
// so the shortlist and the explorer link always show the same providers in the same order.
//
// Provider fields come from providers.json, which community PRs can edit: everything is escaped before it reaches
// innerHTML, a slug reaches an href only after SLUG_RE, and an outbound URL only when it is https.

import { htmlEsc, ICON, SLUG_RE } from './rows.mjs';
import { recommendedCmp } from './rules.mjs';
import { pythonStringLiteral, pythonChatQuickstart, pythonEmbeddingsQuickstart } from './quickstart.mjs';

// What the visitor builds. `text` maps to the explorer's "Text LLMs only" chip (is_text_llm), `mod` to its modality menu.
export const USES = [
  { value: 'chat', label: 'Chat or text generation', hint: 'a text LLM you call from your app', text: true },
  { value: 'code', label: 'Code: an assistant, agent or IDE tool', hint: 'a text LLM; most tools want an OpenAI-compatible API', text: true },
  { value: 'embeddings', label: 'Embeddings for search or RAG', hint: 'vectors for retrieval', mod: 'embeddings' },
  { value: 'speech', label: 'Speech to text or text to speech', hint: 'transcription or voice', mod: 'audio' },
  { value: 'image', label: 'Image generation', hint: 'pictures from a prompt', mod: 'image' },
  { value: 'ocr', label: 'OCR and documents', hint: 'text out of scans and PDFs', mod: 'ocr' },
];

// The yes/no questions. `when` is the answer that constrains; `param` is the explorer chip (?nocard=1 …) it turns on;
// `value` reads the tri-state field; `want` is the one confirmed value that passes, exactly as explorer.js filters.
// commercial_ok "conditional" is not a confirmed yes: it fails the explorer chip, and here it is shown as not confirmed.
export const CONSTRAINTS = [
  {
    key: 'card', when: 'no', param: 'nocard', want: false, value: (p) => p.card_required,
    legend: 'Can you add a credit card when you sign up?', yes: 'Yes, a card is fine', no: 'No card',
    words: { yes: 'no card', no: 'card required', unknown: 'card: not confirmed' }, icons: { yes: 'ic-nocard', no: 'ic-card' },
  },
  {
    key: 'phone', when: 'no', param: 'nophone', want: false, value: (p) => p.phone_required,
    legend: 'Can you verify a phone number?', yes: 'Yes, a phone is fine', no: 'No phone',
    words: { yes: 'no phone', no: 'phone required', unknown: 'phone: not confirmed' }, icons: { yes: 'ic-nophone', no: 'ic-phone' },
  },
  {
    key: 'commercial', when: 'yes', param: 'commercial', want: true, value: (p) => (p.commercial_ok === 'conditional' ? null : p.commercial_ok),
    legend: 'Will you use it in a commercial product?', yes: 'Yes, commercially', no: 'No, just testing',
    words: { yes: 'commercial OK', no: 'eval only', unknown: 'commercial use: not confirmed' }, icons: { yes: 'ic-building', no: 'ic-flask' },
  },
  {
    key: 'train', when: 'yes', param: 'notrain', want: false, value: (p) => (p.data_policy ? p.data_policy.trains_on_prompts : null),
    legend: 'Must your prompts stay out of model training?', yes: 'Yes, no training', no: 'Doesn’t matter',
    words: { yes: 'no training on prompts', no: 'may train on prompts', unknown: 'training: not stated' }, icons: { yes: 'ic-shield', no: 'ic-warn' },
  },
  {
    key: 'openai', when: 'yes', param: 'openai', want: true, value: (p) => p.openai_compatible,
    legend: 'Do you need an OpenAI-compatible API?', yes: 'Yes, OpenAI-compatible', no: 'No, any API',
    words: { yes: 'OpenAI-compatible', no: 'not OpenAI-compatible', unknown: 'OpenAI-compatible: not confirmed' }, icons: { yes: 'ic-code', no: 'ic-code' },
  },
];

// The keys of the hash, in the order toHash writes them.
export const HASH_KEYS = ['use', ...CONSTRAINTS.map((c) => c.key)];

/** Reads `#use=chat&card=no…` into answers. Unknown keys, unknown values and repeats after the first are dropped. */
export function parseHash(hash) {
  const out = {};
  const raw = String(hash == null ? '' : hash).replace(/^#/, '');
  if (!raw) return out;
  for (const part of raw.split('&')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    let k, v;
    try { k = decodeURIComponent(part.slice(0, eq)); v = decodeURIComponent(part.slice(eq + 1)); } catch { continue; }
    if (Object.prototype.hasOwnProperty.call(out, k)) continue;
    if (k === 'use') { if (USES.some((u) => u.value === v)) out.use = v; continue; }
    if (CONSTRAINTS.some((c) => c.key === k) && (v === 'yes' || v === 'no')) out[k] = v;
  }
  return out;
}

/** The canonical hash for some answers (no leading '#'): the keys in HASH_KEYS order, only valid answers. */
export function toHash(answers) {
  const a = parseHash(Object.keys(answers || {}).map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(answers[k])}`).join('&'));
  return HASH_KEYS.filter((k) => a[k] !== undefined).map((k) => `${k}=${a[k]}`).join('&');
}

/** The constraints these answers turn on. */
export function activeConstraints(answers) {
  return CONSTRAINTS.filter((c) => answers && answers[c.key] === c.when);
}

/** 'yes' when the field holds the confirmed value the constraint wants, 'unknown' when it is not confirmed, else 'no'. */
export function constraintState(p, c) {
  const v = c.value(p);
  if (v === c.want) return 'yes';
  if (v === null || v === undefined) return 'unknown';
  return 'no';
}

/** Whether a provider offers what the visitor builds: the explorer's "Text LLMs only" chip or its modality menu. */
export function usesMatch(p, use) {
  const u = USES.find((x) => x.value === use);
  if (!u) return true;
  if (u.text) return p.is_text_llm === true;
  return (p.modalities || []).includes(u.mod);
}

/** One provider against the answers: does it offer the use, and which constraints are not confirmed or contradicted. */
export function evaluateProvider(p, answers) {
  const unknown = [], failed = [];
  for (const c of activeConstraints(answers)) {
    const s = constraintState(p, c);
    if (s === 'unknown') unknown.push(c.key);
    else if (s === 'no') failed.push(c.key);
  }
  return { use: usesMatch(p, answers && answers.use), unknown, failed };
}

/**
 * The shortlist: `matches` (every active constraint confirmed: the providers the explorer link shows) and `possible`
 * (nothing contradicted, at least one constraint not confirmed), each in the explorer's "Recommended" order.
 */
export function shortlist(providers, answers) {
  const matches = [], possible = [];
  for (const p of providers || []) {
    const e = evaluateProvider(p, answers);
    if (!e.use || e.failed.length) continue;
    (e.unknown.length ? possible : matches).push(p);
  }
  matches.sort(recommendedCmp);
  possible.sort(recommendedCmp);
  return { matches, possible };
}

/** The explorer with the same filters, e.g. `../?text=1&nocard=1#explorer` (the parameters explorer.js reads). */
export function explorerHref(answers, prefix = '../') {
  const params = [];
  const u = USES.find((x) => x.value === (answers && answers.use));
  if (u && u.mod) params.push(`mod=${u.mod}`);
  const on = new Set(activeConstraints(answers).map((c) => c.param));
  if (u && u.text) on.add('text');
  // The order explorer.js writes its own URL in (URL_FLAGS), so a link and a hand-filtered explorer read the same.
  for (const k of ['nocard', 'nophone', 'commercial', 'text', 'notrain', 'openai']) if (on.has(k)) params.push(`${k}=1`);
  return `${prefix}${params.length ? '?' + params.join('&') : ''}#explorer`;
}

// ---------- the data the page inlines ----------

// Only the fields the wizard reads (filter, order, result card, quickstart). The full record stays in /providers.json.
export const FIND_FIELDS = ['slug', 'name', 'category', 'free_type', 'free_tier', 'best_for', 'verified', 'last_verified',
  'card_required', 'phone_required', 'commercial_ok', 'commercial_ok_condition', 'openai_compatible', 'openai_base_url',
  'is_text_llm', 'modalities', 'model_tier', 'expires', 'docs_url', 'keys_url'];
export const LIMIT_FIELDS = ['requests_per_second', 'requests_per_minute', 'requests_per_day', 'requests_per_month', 'tokens_per_day', 'tokens_per_month'];

const httpsUrl = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : null);

/** The first sampled free model id, for the quickstart (models_free is a list, or a map of lists). */
export function firstModel(p) {
  const m = p && p.models_free;
  const list = Array.isArray(m) ? m : (m && typeof m === 'object' ? Object.values(m).flat() : []);
  const first = list.find((x) => typeof x === 'string' && x);
  return first || null;
}

/** One provider as the page inlines it. keys_url (the provider's own key page, #810) is optional in the dataset: absent (or not https) means no key link. */
export function findProvider(p) {
  const out = {};
  for (const k of FIND_FIELDS) if (p[k] !== undefined) out[k] = p[k];
  for (const k of ['docs_url', 'keys_url', 'openai_base_url']) {
    if (k in out && !httpsUrl(out[k])) delete out[k];
  }
  const model = firstModel(p);
  if (model) out.model = model;
  const fl = p.free_limits || {};
  const limits = {};
  for (const k of LIMIT_FIELDS) if (Number.isInteger(fl[k])) limits[k] = fl[k];
  if (Object.keys(limits).length) out.free_limits = limits;
  if (p.data_policy && p.data_policy.trains_on_prompts !== undefined) out.data_policy = { trains_on_prompts: p.data_policy.trains_on_prompts };
  return out;
}

/** The whole payload: `{asof, providers}`, providers in dataset order (the client sorts). */
export function findPayload(providers, asof) {
  return { asof, providers: (providers || []).map(findProvider) };
}

// ---------- one result ----------

const LIMIT_WORDS = {
  requests_per_second: 'requests / second', requests_per_minute: 'requests / minute', requests_per_day: 'requests / day',
  requests_per_month: 'requests / month', tokens_per_day: 'tokens / day', tokens_per_month: 'tokens / month',
};

/** The flags of one result: the constraints asked first (with their state), then the other confirmed access flags. */
export function resultFlags(p, answers) {
  const asked = new Set(activeConstraints(answers).map((c) => c.key));
  const flags = [];
  for (const c of CONSTRAINTS) {
    const s = constraintState(p, c);
    // Asked: always shown, whatever its state. Not asked: a confirmed plus, or a confirmed catch at signup or for use.
    const shown = asked.has(c.key) || s === 'yes' || (s === 'no' && ['card', 'phone', 'commercial'].includes(c.key));
    if (shown) flags.push({ key: c.key, state: s, asked: asked.has(c.key) });
  }
  return flags;
}

/** The copyable quickstart for one result, or null when no OpenAI-compatible endpoint is recorded for it. */
export function quickstartFor(p, use) {
  if (!p.openai_base_url || !/^https:\/\//i.test(p.openai_base_url)) return null;
  if (use === 'speech' || use === 'image' || use === 'ocr') return null;
  const model = p.model || '<a-free-model>';
  if (use === 'embeddings') return { lang: 'python', code: pythonEmbeddingsQuickstart(p.openai_base_url, model) };
  return { lang: 'python', code: pythonChatQuickstart(p.openai_base_url, model) };
}

/** One shortlist entry. `prefix` is the path to the site root ('../' on /find/). */
export function resultHtml(p, answers, opts = {}) {
  const prefix = opts.prefix == null ? '../' : opts.prefix;
  const rank = opts.rank;
  const slugOk = SLUG_RE.test(String(p.slug || ''));
  const name = slugOk ? `<a href="${prefix}p/${p.slug}">${htmlEsc(p.name)}</a>` : htmlEsc(p.name);
  const type = `<span class="badge ${p.category === 'ongoing' ? 'b-ongoing' : 'b-trial'}">${p.category === 'ongoing' ? 'Ongoing' : 'Trial'}</span>`;
  const verified = p.verified && p.last_verified
    ? `<span class="find-ver">Verified ${htmlEsc(p.last_verified)}</span>`
    : `<span class="find-ver">${ICON('ic-warn')} unverified</span>`;

  const flags = resultFlags(p, answers).map((f) => {
    const c = CONSTRAINTS.find((x) => x.key === f.key);
    const icon = f.state === 'unknown' ? 'ic-warn' : c.icons[f.state];
    const word = c.words[f.state];
    const cond = f.key === 'commercial' && p.commercial_ok === 'conditional'
      ? ` title="${htmlEsc('Conditional' + (p.commercial_ok_condition ? ': ' + p.commercial_ok_condition : ''))}"` : '';
    return `<span class="flag-badge find-flag is-${f.state}"${cond}>${ICON(icon)}${htmlEsc(word)}</span>`;
  }).join('');

  const fl = p.free_limits || {};
  const limits = LIMIT_FIELDS.filter((k) => Number.isInteger(fl[k]))
    .map((k) => `<li>${fl[k].toLocaleString('en-US')} ${LIMIT_WORDS[k]}</li>`).join('');
  const expires = p.expires ? `<li>Expires: ${htmlEsc(p.expires)}</li>` : '';

  const keys = httpsUrl(p.keys_url);
  const docs = httpsUrl(p.docs_url);
  const slugAttr = slugOk ? ` data-provider="${p.slug}"` : '';
  const actions = [
    keys ? `<a class="btn primary" href="${htmlEsc(keys)}" target="_blank" rel="noopener"${slugAttr ? slugAttr + ' data-link="keys"' : ''}>Get a free key<span class="sr-only"> for ${htmlEsc(p.name)} (opens in a new tab)</span></a>` : '',
    docs ? `<a class="btn ghost" href="${htmlEsc(docs)}" target="_blank" rel="noopener"${slugAttr ? slugAttr + ' data-link="docs"' : ''}>Official docs<span class="sr-only"> of ${htmlEsc(p.name)} (opens in a new tab)</span></a>` : '',
    slugOk ? `<a class="btn ghost" href="${prefix}p/${p.slug}">Details<span class="sr-only"> of ${htmlEsc(p.name)}</span></a>` : '',
  ].join('');

  const qs = quickstartFor(p, answers && answers.use);
  const quick = qs
    ? `<details class="find-quick"><summary>Quickstart (Python, OpenAI SDK)</summary><pre><code>${htmlEsc(qs.code)}</code></pre></details>`
    : `<p class="find-quick-none muted">No OpenAI-compatible endpoint is recorded for this use: start from the ${docs ? 'official docs' : 'provider page'}.</p>`;

  return `<li class="find-item">` +
    `<div class="find-item-head">${rank ? `<span class="find-rank" aria-hidden="true">${rank}</span>` : ''}<h3>${name}</h3>${type}${verified}</div>` +
    (p.best_for ? `<p class="find-best">${htmlEsc(p.best_for)}</p>` : '') +
    `<p class="find-free"><strong>Free:</strong> ${htmlEsc(p.free_tier)}</p>` +
    (limits || expires ? `<ul class="find-limits" aria-label="Published limits">${limits}${expires}</ul>` : '') +
    (flags ? `<div class="find-flags">${flags}</div>` : '') +
    `<div class="find-actions">${actions}</div>` +
    quick +
    `</li>`;
}

/** A one-line summary of the answers, e.g. "Chat or text generation · no card · commercial use". */
export function answersSummary(answers) {
  const u = USES.find((x) => x.value === (answers && answers.use));
  const parts = [u ? u.label : 'Any use'];
  for (const c of activeConstraints(answers)) parts.push(c.words.yes);
  return parts.join(' · ');
}

/** The wizard_complete parameters: fixed lists and a count, nothing typed by the visitor. */
export function completeEvent(answers, count) {
  return {
    use: (answers && USES.some((u) => u.value === answers.use)) ? answers.use : 'any',
    filters: activeConstraints(answers).map((c) => c.key).join(',') || 'none',
    results: Math.max(0, Math.min(999, Number.isInteger(count) ? count : 0)),
  };
}

/**
 * The exact client bundle the browser runs (written to site/shared-find.js by build.mjs), so the build and
 * find.test.mjs consume the same string. The constraint table is rebuilt from source text so its value readers
 * survive serialisation.
 */
export function clientBundle() {
  const constraintsSrc = '[' + CONSTRAINTS.map((c) => '{' + Object.entries(c).map(([k, v]) =>
    `${JSON.stringify(k)}: ${typeof v === 'function' ? v.toString() : JSON.stringify(v)}`).join(', ') + '}').join(',\n    ') + ']';
  const fns = [parseHash, toHash, activeConstraints, constraintState, usesMatch, evaluateProvider, shortlist, explorerHref,
    resultFlags, quickstartFor, resultHtml, answersSummary, completeEvent,
    pythonStringLiteral, pythonChatQuickstart, pythonEmbeddingsQuickstart];
  return `// AUTO-GENERATED by scripts/build.mjs from scripts/lib/find.mjs — do not edit.
window.FLLM_FIND = (function () {
  const { recommendedCmp } = window.FLLM_RULES;
  const USES = ${JSON.stringify(USES)};
  const CONSTRAINTS = ${constraintsSrc};
  const HASH_KEYS = ${JSON.stringify(HASH_KEYS)};
  const LIMIT_FIELDS = ${JSON.stringify(LIMIT_FIELDS)};
  const LIMIT_WORDS = ${JSON.stringify(LIMIT_WORDS)};
  const SLUG_RE = ${SLUG_RE.toString()};
  const htmlEsc = ${htmlEsc.toString()};
  const ICON = ${ICON.toString()};
  const httpsUrl = ${httpsUrl.toString()};
${fns.map((f) => `  ${f.toString()}`).join('\n')}
  return { USES, CONSTRAINTS, HASH_KEYS, parseHash, toHash, activeConstraints, constraintState, usesMatch, evaluateProvider,
    shortlist, explorerHref, resultFlags, quickstartFor, resultHtml, answersSummary, completeEvent };
})();
`;
}
