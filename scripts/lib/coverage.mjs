// coverage.mjs — what the dataset does not know yet, field by field, as a task board.
//
// A value that is null (or empty, or absent) is "not confirmed": nobody has recorded it, which is never
// the same as "no". Each field has a stated population, because a one-time trial credit cannot carry a
// model tier or free limits (the validator rejects them), so counting trial credits as gaps there would
// be a gap nobody can close. The page lists every open gap with the provider's own docs link and a
// prefilled issue, so a first contribution is one value, with its source.
//
// For the four tri-state flags, a null with a recorded reason (field_checks: source_silent, needs_account,
// sources_disagree) is "resolved without an answer": somebody read the provider's pages on a stated day and they
// do not settle it. Those are counted apart and are not open tasks; only a null with no recorded check
// (not_checked) is. byStatus gives every count by status, plus the non-null values with no stated source.

import { htmlEsc, SLUG_RE } from './rows.mjs';
import { FIELD_CHECK_FIELDS, NULL_REASONS, REASON_LABEL, fieldCheck, fieldCheckStatus, fieldCheckCounts } from './field-checks.mjs';

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

/**
 * [{ key, label, population, total, confirmed, open: [provider], resolved: [provider], byStatus? }] computed from the
 * providers, in field order. open = not confirmed and no recorded reason; resolved = null with a recorded reason (flags only).
 */
export function coverage(providers) {
  return COVERAGE_FIELDS.map((f) => {
    const pop = providers.filter(f.inPop);
    const missing = pop.filter((p) => !f.has(p));
    const isFlag = FIELD_CHECK_FIELDS.includes(f.key);
    const resolved = isFlag ? missing.filter((p) => p[f.key] === null && NULL_REASONS.includes(fieldCheckStatus(p, f.key))) : [];
    const open = missing.filter((p) => !resolved.includes(p));
    const row = { key: f.key, label: f.label, population: f.population, total: pop.length, confirmed: pop.length - missing.length, open, resolved };
    if (isFlag) row.byStatus = fieldCheckCounts(pop, f.key);
    return row;
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
export function coverageMainHtml(rows, { repo, generated, prefix = '../', histogram = null }) {
  const summary = rows.map((r) =>
    `<tr><th scope="row"><span class="cov-label">${htmlEsc(r.label)}</span><span class="cov-pop">counted over ${htmlEsc(r.population)}</span></th><td class="cov-popcol">${htmlEsc(r.population)}</td>` +
    `<td class="num">${r.confirmed} of ${r.total}</td><td class="num">${percent(r.confirmed, r.total)}%</td><td class="num">${r.open.length}</td>` +
    `<td class="num">${r.byStatus ? r.resolved.length : '—'}</td></tr>`).join('');
  const flagRows = rows.filter((r) => r.byStatus);
  const reasonsTable = flagRows.length
    ? '<h2 id="reasons">Why a flag is still unknown</h2>' +
      '<p>For the four yes/no flags, the dataset records why an unknown value is unknown: the provider’s pages were read on a stated day and <strong>do not say it</strong>, only <strong>an account</strong> would tell (this project does not create accounts), or <strong>two official pages disagree</strong>. Those are resolved without an answer and are not open tasks. A value with no recorded check is still open. Known values with no recorded source are counted as <em>unsourced</em>. Counted over all verified providers.</p>' +
      '<div class="table-scroll" role="region" aria-label="Why a flag is still unknown, by flag" tabindex="0"><table class="cov-table cov-reasons"><thead><tr><th>Flag</th><th class="num">Stated, with source</th><th class="num">Unsourced</th><th class="num">Not checked</th><th class="num">Not stated by the provider</th><th class="num">Needs an account</th><th class="num">Pages disagree</th></tr></thead><tbody>' +
      flagRows.map((r) => `<tr id="reasons-${r.key}"><th scope="row">${htmlEsc(r.key)}</th>` +
        ['stated', 'unsourced', 'not_checked', 'source_silent', 'needs_account', 'sources_disagree'].map((k) => `<td class="num">${r.byStatus[k]}</td>`).join('') + '</tr>').join('') +
      '</tbody></table></div>'
    : '';
  const resolvedSections = flagRows.filter((r) => r.resolved.length).map((r) => {
    const items = r.resolved.map((p) => {
      const c = fieldCheck(p, r.key);
      const name = SLUG_RE.test(String(p.slug || '')) ? `<a href="${prefix}p/${p.slug}">${htmlEsc(p.name)}</a>` : htmlEsc(p.name);
      return `<li class="cov-resolved">${name} <span class="sep">·</span> ${htmlEsc(REASON_LABEL[c.status])} <span class="sep">·</span> checked ${htmlEsc(c.checked)}</li>`;
    }).join('');
    return `<details class="cov-field" id="${r.key}-resolved"><summary><strong>${htmlEsc(r.label)}</strong> <span class="muted">· ${r.resolved.length} not confirmed, resolved without an answer</span></summary><ul class="cov-list">${items}</ul></details>`;
  }).join('');
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
    '<div class="table-scroll" role="region" aria-label="What the dataset does not know yet, by field" tabindex="0"><table class="cov-table"><thead><tr><th>Field</th><th class="cov-popcol">Counted over</th><th class="num">Confirmed</th><th class="num">Share</th><th class="num">Open</th><th class="num">Resolved, no answer</th></tr></thead><tbody>' + summary + '</tbody></table></div>' +
    '<p class="muted">A one-time trial credit cannot carry a model tier or published limits (the validator rejects them), so trial credits are not counted as gaps for those two fields.</p>' +
    '<h2>Pick one value</h2>' +
    '<p>Each open item has the provider\'s own docs and a prefilled issue. A good contribution is <strong>one value with its source</strong>: the provider\'s own page, the sentence it rests on and the day you read it. Third-party summaries are not sources. Prefer an issue if you are unsure; to edit the data yourself, see the <a href="' + htmlEsc(repo) + '/blob/main/CONTRIBUTING.md">contributing guide</a> (data is edited only in <code>data/*.json</code>).</p>' +
    sections +
    reasonsTable +
    resolvedSections +
    freshnessHistogramHtml(histogram, { repo, prefix }) +
    '</div></main>';
}

/**
 * The freshness histogram section of /coverage/ (see lib/freshness-histogram.mjs): how many verified
 * entries reach day 61 (due for re-verification) and day 91 (past the SLA) in each coming week. Empty
 * string without a histogram. Every value is a number or a date the build computed.
 */
export function freshnessHistogramHtml(h, { repo, prefix = '../' }) {
  if (!h || !Array.isArray(h.rows) || !h.rows.length) return '';
  const limit = Number(h.limit) || 8;
  const body = h.rows.map((r) =>
    `<tr${r.clustered ? ' class="cov-cluster"' : ''}><th scope="row">${htmlEsc(r.week)}</th><td class="num">${Number(r.due)}${r.clustered ? ' <span class="muted">(cluster)</span>' : ''}</td><td class="num">${Number(r.stale)}</td></tr>`).join('');
  const before = h.dueBefore ? `<p class="muted">${Number(h.dueBefore)} entries were already due when this window opens (${Number(h.staleBefore)} past the SLA).</p>` : '';
  return '<h2 id="freshness">When entries come due</h2>' +
    `<p>Every verified entry is re-checked against the provider’s own docs within 90 days. It counts as <strong>due</strong> from day 61 and <strong>past the SLA</strong> from day 91. The table counts, per week, the entries that cross each line if nobody re-checks them first. A week with more than ${limit} entries becoming due is a cluster: the <a href="${htmlEsc(repo)}/issues/4">weekly worklist</a> pulls those entries forward, a few each week, so they do not all expire together. Weeks start on Monday (UTC), from the week of the data date. The same entries counted by the week of their last verification are on the <a href="${prefix}quality/#freshness-weeks">data quality</a> page.</p>` +
    '<div class="table-scroll" role="region" aria-label="Entries coming due, by week" tabindex="0"><table class="cov-table cov-fresh"><thead><tr><th>Week of</th><th class="num">Become due (day 61)</th><th class="num">Past the SLA (day 91)</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
    before;
}
