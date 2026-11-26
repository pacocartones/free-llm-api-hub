// provider-markdown.mjs — the Markdown version of a provider page (/p/<slug>.md) and its one-line entry in llms.txt.
//
// Answer engines and agents read Markdown more reliably than a styled HTML page, so every provider page has a plain-text
// twin built from the same record: the "is it free" answer, the limits, the four flags with the pages read and the day,
// the quickstart and the links. It states only what data/providers.json holds: an unknown flag reads "unknown" with its
// recorded reason, never "no", and a number appears only with the page it comes from and the day it was read.
//
// The twin is an alternate, not a second canonical page. It lives at /p/<slug>.md next to /p/<slug>.html (GitHub Pages
// resolves the extensionless /p/<slug> to the .html file only), names the HTML page as canonical in its header, and is
// left out of sitemap.xml, which lists canonical URLs only. GitHub Pages serves .md as text/markdown.
//
// Provider fields are community-editable: prose is flattened to one line and Markdown syntax in it is escaped, links
// are written only for public https URLs, and code goes in a fence longer than any backtick run inside it.

import { pythonChatQuickstart, pythonEmbeddingsQuickstart, curlChatQuickstart } from './quickstart.mjs';
import { fieldCheck, REASON_LABEL } from './field-checks.mjs';
import { trainState } from './data-policy-page.mjs';
import { limitFigures } from './provider-meta.mjs';
import { shortenProse } from './short-text.mjs';

export const FREE_TYPE_WORDS = Object.freeze({
  'renewing-quota': 'free quota that renews',
  perpetual: 'free with no end date',
  'recurring-credit': 'credit that renews',
  'trial-credit': 'one-time trial credit',
});

const LIMIT_UNITS = [
  ['requests_per_second', 'requests per second'],
  ['requests_per_minute', 'requests per minute'],
  ['requests_per_day', 'requests per day'],
  ['requests_per_month', 'requests per month'],
  ['tokens_per_day', 'tokens per day'],
  ['tokens_per_month', 'tokens per month'],
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** One line of prose with Markdown syntax escaped (links, emphasis, code, HTML). */
export const mdText = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().replace(/([\\`*[\]<>])/g, '\\$1');

/** The URL when it is a plain public https URL that is safe inside `(…)`, else ''. */
export const mdUrl = (u) => (typeof u === 'string' && /^https:\/\/[^\s()<>\\]+$/i.test(u) ? u : '');

const link = (text, url) => (mdUrl(url) ? `[${text}](${mdUrl(url)})` : '');

/** Inline code that survives backticks in the value. */
export const mdCode = (s) => {
  const v = String(s ?? '').replace(/\s+/g, ' ');
  const run = Math.max(0, ...[...v.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(run + 1);
  return run ? `${fence} ${v} ${fence}` : `${fence}${v}${fence}`;
};

/** A fenced code block whose fence is longer than any backtick run in the code. */
export const mdFence = (lang, code) => {
  const run = Math.max(2, ...[...String(code).matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(run + 1);
  return `${fence}${lang}\n${String(code).replace(/\n+$/, '')}\n${fence}`;
};

/** The model a quickstart uses: the first sampled free model, else a placeholder. Same choice as the HTML page. */
export function quickstartModel(p) {
  const DEFAULT_MODEL = { groq: 'llama-3.1-8b-instant' };
  return (p.models_free && p.models_free[0]) || DEFAULT_MODEL[p.slug] || '<a-free-model>';
}

/** "Is <name> free?" answered in one paragraph from category, free_type and free_tier. */
export function isItFreeMd(p) {
  const kind = FREE_TYPE_WORDS[p.free_type];
  const what = mdText(p.free_tier);
  let lead;
  if (p.free_type === 'trial-credit') lead = `Partly. ${mdText(p.name)} gives a one-time trial credit, not a free tier that renews.`;
  else if (p.free_type === 'recurring-credit') lead = `Yes, as a credit that renews. ${mdText(p.name)} gives a free credit on a schedule.`;
  else if (p.free_type === 'perpetual') lead = `Yes. ${mdText(p.name)} lists models as free with no end date.`;
  else if (p.free_type === 'renewing-quota') lead = `Yes. ${mdText(p.name)} has an ongoing free tier: a free quota that renews.`;
  else lead = `${mdText(p.name)} has a ${p.category === 'ongoing' ? 'free tier' : 'trial credit'}${kind ? ` (${kind})` : ''}.`;
  const expiry = p.expires ? ` Expires: ${mdText(p.expires)}.` : '';
  const verified = p.verified === true && DATE_RE.test(String(p.last_verified || ''))
    ? `Verified against the provider's own docs on ${p.last_verified}.`
    : 'Not verified yet: confirm every figure against the provider\'s docs.';
  return `${lead} What is free: ${what}${/[.!?]$/.test(what) ? '' : '.'}${expiry}\n\n${verified}`;
}

/** The pages read for a check and the day, as one Markdown sentence ('' when there is no dated check). */
export function checkSourceMd(check) {
  if (!check || !DATE_RE.test(String(check.checked || ''))) return '';
  const urls = (Array.isArray(check.sources) ? check.sources : []).map(mdUrl).filter(Boolean);
  const pages = urls.map((u, i) => `[${urls.length > 1 ? `page ${i + 1}` : "the provider's page"}](${u})`).join(', ');
  const quote = check.status === 'stated' && check.quote ? `"${mdText(check.quote)}" ` : '';
  const lead = check.status === 'stated' ? 'Per' : 'Read';
  return `${quote}${pages ? `${lead} ${pages}, ` : ''}checked ${check.checked}.${check.note ? ` ${mdText(check.note)}` : ''}`;
}

/** A tri-state flag in words; null says its recorded reason, never "no". */
export function flagWords(value, yes, no, check) {
  if (value === true) return yes;
  if (value === false) return no;
  if (value === 'conditional') return 'conditional';
  const reason = check && REASON_LABEL[check.status] && check.status !== 'stated' ? REASON_LABEL[check.status] : REASON_LABEL.not_checked;
  return `unknown (${reason})`;
}

function flagsMd(p) {
  const line = (label, field, yes, no, extra = '') => {
    const check = fieldCheck(p, field);
    const src = checkSourceMd(check);
    return `- **${label}:** ${flagWords(p[field], yes, no, check)}${extra}${src ? `. ${src}` : ''}`;
  };
  const condition = p.commercial_ok === 'conditional' && p.commercial_ok_condition ? ` (${mdText(p.commercial_ok_condition)})` : '';
  const base = p.openai_base_url ? `, base URL ${mdCode(p.openai_base_url)}` : '';
  const rows = [
    line('Credit card', 'card_required', 'required', 'not required'),
    line('Phone verification', 'phone_required', 'required', 'not required'),
    line('Commercial use', 'commercial_ok', 'allowed', 'not allowed (evaluation only)', condition),
    line('OpenAI-compatible', 'openai_compatible', 'yes', 'no', base),
  ];
  const dp = p.data_policy && typeof p.data_policy === 'object' ? p.data_policy : null;
  if (dp) {
    const trains = { yes: 'yes', no: 'no' }[trainState(p)] || 'not confirmed';
    const quote = dp.quote ? ` "${mdText(dp.quote)}"` : '';
    const src = link("the provider's page", dp.source);
    rows.push(`- **Trains on your prompts:** ${trains}.${quote}${src ? ` Per ${src}` : ''}${DATE_RE.test(String(dp.checked || '')) ? `${src ? ',' : ''} checked ${dp.checked}` : ''}${src || dp.checked ? '.' : ''}`);
    rows.push(`- **Prompt retention:** ${dp.retention ? mdText(dp.retention) : 'not confirmed'}`);
  }
  return rows.join('\n');
}

function limitsMd(p) {
  const fl = p.free_limits && mdUrl(p.free_limits.source) && DATE_RE.test(String(p.free_limits.checked || '')) ? p.free_limits : null;
  const out = [];
  if (fl) {
    const rows = LIMIT_UNITS.filter(([k]) => Number.isInteger(fl[k])).map(([k, unit]) => `- ${fl[k].toLocaleString('en-US')} ${unit}`);
    if (rows.length) out.push(rows.join('\n'));
    out.push(`${fl.scope ? `Scope: ${mdText(fl.scope)}${/[.!?]$/.test(fl.scope) ? '' : '.'} ` : ''}Source: ${link("the provider's page", fl.source)}, read ${fl.checked}.`);
  } else {
    out.push('Numeric limits are not recorded in structured form for this provider.');
  }
  out.push(`**In the provider's words:** ${p.rate_limits ? mdText(p.rate_limits) : 'not specified'}`);
  if (p.notes) out.push(`**The catch:** ${mdText(p.notes)}`);
  return out.join('\n\n');
}

function quickstartMd(p) {
  if (!p.openai_base_url) {
    const docs = link('official docs', p.docs_url);
    return `No OpenAI-compatible base URL is recorded for this offer. Check the ${docs || 'official docs'} for endpoints, authentication and examples.`;
  }
  const model = quickstartModel(p);
  const mods = p.modalities || [];
  if (mods.includes('embeddings') && !mods.includes('text')) {
    return `Embeddings, with the OpenAI Python SDK:\n\n${mdFence('python', pythonEmbeddingsQuickstart(p.openai_base_url, model))}`;
  }
  return `Chat completions, with the OpenAI Python SDK:\n\n${mdFence('python', pythonChatQuickstart(p.openai_base_url, model))}\n\n` +
    `Or with curl:\n\n${mdFence('bash', curlChatQuickstart(p.openai_base_url, model))}`;
}

function linksMd(p, { site }) {
  return [
    `- [Provider page (HTML, canonical)](${site}/p/${p.slug})`,
    link('Official docs', p.docs_url) && `- ${link('Official docs', p.docs_url)}`,
    link('Get a free key', p.keys_url) && `- ${link('Get a free key', p.keys_url)}`,
    link('Model catalogue', p.models_url) && `- ${link('Model catalogue', p.models_url)}`,
    link('Playground', p.playground_url) && `- ${link('Playground', p.playground_url)}`,
    `- [Compare with another provider](${site}/compare/?compare=${p.slug})`,
    `- [Full dataset, JSON](${site}/api/v1/providers.json)`,
    `- [Every provider in one Markdown file](${site}/llms-full.txt)`,
  ].filter(Boolean).join('\n');
}

/** The whole /p/<slug>.md document. */
export function providerMarkdown(p, { site, asOf, version }) {
  const models = (p.models_free || []).length
    ? `\n\n**Free models (sample):** ${p.models_free.map(mdCode).join(', ')}`
    : '';
  return `# ${mdText(p.name)}: free tier and limits\n\n` +
    `> ${mdText(p.best_for || p.free_tier)}\n\n` +
    `Data of ${asOf} (dataset v${version}) from the Free LLM API Hub, MIT-licensed. Canonical page: ${site}/p/${p.slug}\n\n` +
    `## Is ${mdText(p.name)} free?\n\n${isItFreeMd(p)}\n\n` +
    `## Free limits\n\n${limitsMd(p)}\n\n` +
    `## Flags\n\n${flagsMd(p)}\n\n` +
    `## At a glance\n\n` +
    `- **Plan:** ${p.category === 'ongoing' ? 'ongoing free tier' : 'trial credit'} (${FREE_TYPE_WORDS[p.free_type] || 'not recorded'})\n` +
    `- **Modalities:** ${mdText((p.modalities || []).join(', ') || 'not listed')}\n` +
    `- **Expires:** ${p.expires ? mdText(p.expires) : p.free_type === 'trial-credit' && !p.no_expiry ? 'not confirmed' : 'no expiry'}` +
    models + `\n\n` +
    `## Quickstart\n\n${quickstartMd(p)}\n\n` +
    `## Links\n\n${linksMd(p, { site })}\n`;
}

/** A one-line summary of the free limits for llms.txt: the structured figures, else the provider's words shortened. */
export function oneLineLimits(p) {
  const figures = p.free_limits && mdUrl(p.free_limits.source) ? limitFigures(p.free_limits) : [];
  if (figures.length) return figures.join(', ');
  if (p.rate_limits) return mdText(shortenProse(String(p.rate_limits).replace(/\s+/g, ' '), 120).text);
  return 'limits not specified';
}

/** One provider line of llms.txt: name, free type, limits, HTML page and Markdown twin. */
export function llmsProviderLine(p, { site }) {
  return `- [${mdText(p.name)}](${site}/p/${p.slug}): ${FREE_TYPE_WORDS[p.free_type] || p.category}; ${oneLineLimits(p)} ([Markdown](${site}/p/${p.slug}.md))`;
}
