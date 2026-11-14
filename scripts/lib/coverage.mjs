// coverage.mjs — what the dataset does not know yet, field by field, as a task board.
//
// A value that is null (or empty, or absent) is "not confirmed": nobody has recorded it, which is never
// the same as "no". Each field has a stated population, because a one-time trial credit cannot carry a
// model tier or free limits (the validator rejects them), so counting trial credits as gaps there would
// be a gap nobody can close. The page lists every open gap with the provider's own docs link and a
// prefilled issue, so a first contribution is one value, with its source.

import { htmlEsc, SLUG_RE } from './rows.mjs';

const verifiedTextLlm = (p) => p.verified === true && p.is_text_llm === true;

export const COVERAGE_FIELDS = Object.freeze([
  { key: 'card_required', label: 'Credit card required?', population: 'all verified providers', inPop: (p) => p.verified === true, has: (p) => p.card_required != null },
  { key: 'phone_required', label: 'Phone verification required?', population: 'all verified providers', inPop: (p) => p.verified === true, has: (p) => p.phone_required != null },
  { key: 'commercial_ok', label: 'Commercial use allowed?', population: 'all verified providers', inPop: (p) => p.verified === true, has: (p) => typeof p.commercial_ok === 'boolean' },
  { key: 'openai_compatible', label: 'OpenAI-compatible endpoint?', population: 'all verified providers', inPop: (p) => p.verified === true, has: (p) => p.openai_compatible != null },
  { key: 'model_tier', label: 'Model quality tier', population: 'verified text LLMs that are not one-time trial credits', inPop: (p) => verifiedTextLlm(p) && p.free_type !== 'trial-credit', has: (p) => Number.isInteger(p.model_tier) },
  { key: 'free_limits', label: 'Published free limits', population: 'verified text LLMs that are not one-time trial credits', inPop: (p) => verifiedTextLlm(p) && p.free_type !== 'trial-credit', has: (p) => p.free_limits != null },
  { key: 'models_free', label: 'Free model sample', population: 'verified text LLMs', inPop: verifiedTextLlm, has: (p) => Array.isArray(p.models_free) && p.models_free.length > 0 },
  { key: 'data_policy', label: 'Data policy (does it train on prompts, how long it keeps them)', population: 'verified text LLMs', inPop: verifiedTextLlm, has: (p) => p.data_policy != null && typeof p.data_policy === 'object' },
]);

/** [{ key, label, population, total, confirmed, open: [provider] }] computed from the providers, in field order. */
export function coverage(providers) {
  return COVERAGE_FIELDS.map((f) => {
    const pop = providers.filter(f.inPop);
    const open = pop.filter((p) => !f.has(p));
    return { key: f.key, label: f.label, population: f.population, total: pop.length, confirmed: pop.length - open.length, open };
  });
}

export const percent = (n, total) => (total > 0 ? Math.round((100 * n) / total) : 0);

/** The prefilled issue that opens the existing inaccuracy form for one provider and one field. */
export const coverageIssueUrl = (p, field, repo) =>
  `${repo}/issues/new?template=inaccuracy.yml&provider=${encodeURIComponent(p.slug)}&title=${encodeURIComponent(`[coverage] ${field.label} — ${p.name}`)}`;

const safeHttp = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');

/**
 * The main content of /coverage/. `prefix` is the path from the page to the site root. Everything that
 * comes from the data is escaped; a slug becomes a link only after SLUG_RE and a docs URL only if http(s).
 */
export function coverageMainHtml(rows, { repo, generated, prefix = '../' }) {
  const summary = rows.map((r) =>
    `<tr><th scope="row"><span class="cov-label">${htmlEsc(r.label)}</span><span class="cov-pop">counted over ${htmlEsc(r.population)}</span></th><td class="cov-popcol">${htmlEsc(r.population)}</td>` +
    `<td class="num">${r.confirmed} of ${r.total}</td><td class="num">${percent(r.confirmed, r.total)}%</td><td class="num">${r.open.length}</td></tr>`).join('');
  const sections = rows.filter((r) => r.open.length).map((r) => {
    const items = r.open.map((p) => {
      const name = SLUG_RE.test(String(p.slug || '')) ? `<a href="${prefix}p/${p.slug}">${htmlEsc(p.name)}</a>` : htmlEsc(p.name);
      const docs = safeHttp(p.docs_url);
      const docsLink = docs ? `<a href="${htmlEsc(docs)}" target="_blank" rel="noopener">official docs<span class="sr-only"> for ${htmlEsc(p.name)}</span></a>` : '<span class="muted">no official docs link</span>';
      return `<li class="cov-task">${name} <span class="sep">·</span> ${docsLink} <span class="sep">·</span> ` +
        `<a href="${htmlEsc(coverageIssueUrl(p, r, repo))}" target="_blank" rel="noopener">propose the value<span class="sr-only"> for ${htmlEsc(p.name)}</span></a></li>`;
    }).join('');
    return `<details class="cov-field" id="${r.key}"><summary><strong>${htmlEsc(r.label)}</strong> <span class="muted">· ${r.open.length} not confirmed</span></summary><ul class="cov-list">${items}</ul></details>`;
  }).join('');
  return '<main id="main"><div class="wrap prose">' +
    '<h2>What the dataset does not know yet</h2>' +
    '<p>Every field below is counted over the providers it can apply to. A value nobody has recorded reads <strong>not confirmed</strong>: that is not the same as <em>no</em>. Data of ' + htmlEsc(generated) + '.</p>' +
    '<table class="cov-table"><thead><tr><th>Field</th><th class="cov-popcol">Counted over</th><th class="num">Confirmed</th><th class="num">Share</th><th class="num">Open</th></tr></thead><tbody>' + summary + '</tbody></table>' +
    '<p class="muted">A one-time trial credit cannot carry a model tier or published limits (the validator rejects them), so trial credits are not counted as gaps for those two fields.</p>' +
    '<h2>Pick one value</h2>' +
    '<p>Each open item has the provider\'s own docs and a prefilled issue. A good contribution is <strong>one value with its source</strong>: the provider\'s own page, the sentence it rests on and the day you read it. Third-party summaries are not sources. Prefer an issue if you are unsure; to edit the data yourself, see the <a href="' + htmlEsc(repo) + '/blob/main/CONTRIBUTING.md">contributing guide</a> (data is edited only in <code>data/*.json</code>).</p>' +
    sections +
    '</div></main>';
}
