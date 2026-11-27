// report-mistake.mjs — the "Something wrong? Report a mistake" link of a provider page (/p/<slug>) and of the provider
// rows of a model-family page (/free-api/<family>/).
//
// The link opens the repository's data-correction issue form (.github/ISSUE_TEMPLATE/inaccuracy.yml) with the fields
// it can take already filled. GitHub issue forms prefill a field from a query parameter named after its `id`, and the
// title from `title`: `provider` gets the slug, `whats-wrong` starts with the page the reader was on. The form has no
// field for the page URL, so it goes at the top of the free-text answer, where the reader types the rest. A plain link:
// nothing is loaded from GitHub until the reader clicks it.
//
// When there is no repository URL (a fork building without one), the link points to /contributing/ instead, which
// explains every other way to send a correction.

import { escapeHtml as htmlEsc } from './html.mjs';

export const REPORT_TEMPLATE = 'inaccuracy.yml';
// The field ids of the form this module fills. scripts/report-mistake.test.mjs checks they exist in the template.
export const REPORT_FIELDS = Object.freeze({ provider: 'provider', details: 'whats-wrong' });
export const REPORT_LABEL = 'Report a mistake';

/**
 * The raw URL of the prefilled form for provider `p` ({ slug, name }), seen on `pageUrl`. HTML-escape it when writing
 * it into an attribute (reportMistakeHtml does). Without `repo`, the /contributing/ page under `prefix`.
 */
export function reportMistakeUrl(p, { repo, pageUrl, prefix = '../' } = {}) {
  if (!repo) return `${prefix}contributing/`;
  const q = new URLSearchParams();
  q.set('template', REPORT_TEMPLATE);
  q.set(REPORT_FIELDS.provider, p.slug);
  q.set('title', `[outdated] ${p.name}`);
  if (pageUrl) q.set(REPORT_FIELDS.details, `Seen on ${pageUrl}\n\n`);
  // URLSearchParams writes a space as "+"; GitHub reads both, "%20" is the safer of the two in a pasted link.
  return `${repo}/issues/new?${q.toString().replace(/\+/g, '%20')}`;
}

/** The line at the end of a provider page's FAQ: one sentence, the form link, and how corrections work. */
export function reportMistakeHtml(p, { repo, pageUrl, prefix = '../' } = {}) {
  const href = htmlEsc(reportMistakeUrl(p, { repo, pageUrl, prefix }));
  const ext = repo ? ' target="_blank" rel="noopener"' : '';
  return `<p class="report-mistake muted" id="report">Something wrong on this page? <a class="report-link" href="${href}"${ext}>${REPORT_LABEL}</a>` +
    (repo ? ` <span class="report-note">(a GitHub form, with ${htmlEsc(p.name)} and this page already filled in)</span>` : '') +
    ` · <a href="${prefix}contributing/">how corrections work</a></p>`;
}

/** The compact link of a provider row in a table (model-family pages). */
export function reportMistakeRowHtml(p, { repo, pageUrl, prefix = '../../' } = {}) {
  const href = htmlEsc(reportMistakeUrl(p, { repo, pageUrl, prefix }));
  const ext = repo ? ' target="_blank" rel="noopener"' : '';
  return `<a class="report-link" href="${href}"${ext} aria-label="${REPORT_LABEL} about ${htmlEsc(p.name)}">${REPORT_LABEL}</a>`;
}
