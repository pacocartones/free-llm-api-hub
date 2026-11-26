// embed-page.mjs — the /embed/ page ("Use the data"): the widget with a snippet generator, the badges, the data files
// and the citation. It only shows what the site already publishes (widget.js, badge-verified.svg, badges/<slug>.json,
// providers.json/.csv, the JSON API, CITATION.cff); nothing here is new data.
//
// Pure: a function of the providers, the citation and a few constants, so the committed page is deterministic.
// The generator runs in site/embed.js; without JavaScript the page shows the default snippets, which work as they are.

import { htmlEsc } from './rows.mjs';
import { codeHtmlEsc } from './quickstart.mjs';
import { bibtex, apa } from './citation.mjs';

export const EMBED_PATH = '/embed/';
// The widget's own options (site/widget.js): the modalities it filters on and its two categories.
export const WIDGET_MODALITIES = ['text', 'vision', 'image', 'audio', 'embeddings', 'rerank', 'ocr'];
export const WIDGET_DEFAULT = { count: 6, modality: 'text', category: '' };

/** The widget snippet for these options; an empty option is left out, as the widget then uses its default. */
export function widgetSnippet({ count = WIDGET_DEFAULT.count, modality = '', category = '' } = {}, site) {
  const attrs = [`data-count="${count}"`, modality ? `data-modality="${modality}"` : '', category ? `data-category="${category}"` : ''].filter(Boolean).join(' ');
  return `<div id="flh-widget" ${attrs}></div>\n<script src="${site}/widget.js" async></script>`;
}

export const providerBadgeMarkdown = (p, site) =>
  `[![${p.name} on Free LLM API Hub](https://img.shields.io/endpoint?url=${site}/badges/${p.slug}.json)](${site}/p/${p.slug})`;

export const providerBadgeHtml = (p, site) =>
  `<a href="${site}/p/${p.slug}"><img src="https://img.shields.io/endpoint?url=${site}/badges/${p.slug}.json" alt="${htmlEsc(p.name)} on Free LLM API Hub" height="20"></a>`;

export const verifiedBadgeHtml = (site, width) =>
  `<a href="${site}/"><img src="${site}/badge-verified.svg" alt="Verified providers on Free LLM API Hub" width="${width}" height="20"></a>`;

export const verifiedBadgeMarkdown = (site) =>
  `[![Verified providers](${site}/badge-verified.svg)](${site}/)`;

const pre = (kind, text, id = '') => `<pre data-snippet="${kind}"><code${id ? ` id="${id}"` : ''}>${codeHtmlEsc(text)}</code></pre>`;

export function embedTitle() { return 'Use the data: widget, badges, API and citation · Free LLM API Hub'; }
export function embedDescription(n) {
  return `Embed the free LLM API widget or a verified badge, download the dataset of ${n} providers as JSON or CSV, and cite it in BibTeX or APA.`;
}

export function embedMainHtml({ pageHero, site, prefix = '../', providers, badgeWidth, citation, slaDays, defaultSlug = 'groq' }) {
  const sorted = [...providers].sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
  const first = sorted.find((p) => p.slug === defaultSlug) || sorted[0];
  const verifiedCount = providers.filter((p) => p.verified === true).length;
  const widgetForm =
    `<form id="embed-form" class="cmp-form" action="#widget" aria-describedby="embed-form-note">` +
    `<label class="cmp-slot"><span>Providers to show</span><input class="sel" type="number" name="count" min="1" max="20" value="${WIDGET_DEFAULT.count}" inputmode="numeric"></label>` +
    `<label class="cmp-slot"><span>Modality</span><select class="sel" name="modality"><option value="">Any</option>${WIDGET_MODALITIES.map((m) => `<option value="${m}"${m === WIDGET_DEFAULT.modality ? ' selected' : ''}>${m}</option>`).join('')}</select></label>` +
    `<label class="cmp-slot"><span>Category</span><select class="sel" name="category"><option value="">Both</option><option value="ongoing">Ongoing free tier</option><option value="trial">Trial credit</option></select></label>` +
    `</form><p class="muted" id="embed-form-note">The snippet and the preview follow your choices. All attributes are optional; <code>data-sort</code> takes an explorer sort key (<code>recommended</code> by default).</p>`;
  const providerOptions = sorted.map((p) => `<option value="${htmlEsc(p.slug)}"${p === first ? ' selected' : ''}>${htmlEsc(p.name)}</option>`).join('');
  return pageHero({
    crumbs: `<a href="${prefix}">Home</a> / Use the data`,
    h1: 'Use the data',
    lede: `Put the dataset on your own site or in your own code: a live widget, a verified badge, the full data as JSON or CSV, and a citation. All of it is MIT licensed and needs no key.`,
  }) +
    `<main id="main"><div class="wrap prose">` +
    `<nav class="colls" aria-label="On this page"><a href="#widget">Widget</a><a href="#badges">Badges</a><a href="#data">Data files</a><a href="#cite">Cite</a></nav>` +
    `<h2 id="widget">Live widget</h2>` +
    `<p>A compact, always-current list of the top verified free APIs (${verifiedCount} verified today), ranked with the same rules as the <a href="${prefix}#explorer">explorer</a>. It is one script from this site, with inline styles, no cookies and no tracking; it links back to each provider’s page here.</p>` +
    widgetForm +
    pre('embed', widgetSnippet(WIDGET_DEFAULT, site), 'embed-snippet') +
    `<h3>Preview</h3><div class="embed-preview" id="embed-preview"><div id="flh-widget" data-count="${WIDGET_DEFAULT.count}" data-modality="${WIDGET_DEFAULT.modality}"></div></div>` +
    `<noscript><p class="muted">The preview needs JavaScript; the snippet above works as it is.</p></noscript>` +
    `<h2 id="badges">Badges</h2>` +
    `<h3>Verified providers</h3>` +
    `<p><img src="${prefix}badge-verified.svg" alt="Verified providers on Free LLM API Hub" width="${badgeWidth}" height="20" loading="lazy"></p>` +
    `<p>The number of verified providers, rebuilt with the dataset. As HTML or Markdown:</p>` +
    pre('embed', verifiedBadgeHtml(site, badgeWidth)) +
    pre('badge', verifiedBadgeMarkdown(site)) +
    `<h3 id="provider-badge">One provider</h3>` +
    `<p>Every provider has its own badge with the date of its last verification. Its colour follows the age of that check: green while fresh, yellow past 60 days, red past the ${slaDays}-day freshness window, so a badge someone forgot never claims more than the data does. It renders through <a href="https://shields.io/badges/endpoint-badge" target="_blank" rel="noopener">shields.io</a> from <a href="${prefix}badges/${htmlEsc(first.slug)}.json">this site’s JSON</a>; this page loads nothing from shields.io.</p>` +
    `<form class="cmp-form" action="#provider-badge"><label class="cmp-slot"><span>Provider</span><select class="sel" id="badge-provider" name="p">${providerOptions}</select></label></form>` +
    `<p>Markdown:</p>` +
    pre('badge', providerBadgeMarkdown(first, site), 'badge-snippet') +
    `<p>HTML:</p>` +
    pre('badge', providerBadgeHtml(first, site), 'badge-snippet-html') +
    `<p class="muted">Each provider page links here with its badge selected.</p>` +
    `<h2 id="data">Data files</h2>` +
    `<ul>` +
    `<li><a href="${prefix}providers.json">providers.json</a>: every provider, every field, validated against the <a href="${prefix}api/v1/schema.json">published schema</a>.</li>` +
    `<li><a href="${prefix}providers.csv">providers.csv</a>: the same data for spreadsheets.</li>` +
    `<li><a href="${prefix}api/">The static JSON API</a>: versioned endpoints and ready-made slices (no card, commercial use, by modality), described in <a href="${prefix}api/v1/index.json">index.json</a>.</li>` +
    `<li><a href="${prefix}llms.txt">llms.txt</a>: an index of the site for AI agents.</li>` +
    `</ul>` +
    `<p class="muted">No key, no rate limit, no tracking on the files. Fields are only added within <code>/api/v1/</code>; prefer a fixed snapshot? Pin a release tag of <a href="${citation.repository}" target="_blank" rel="noopener">the repository</a>.</p>` +
    `<h2 id="cite">Cite</h2>` +
    `<p>From the repository’s <a href="${citation.repository}/blob/main/CITATION.cff" target="_blank" rel="noopener">CITATION.cff</a>, version ${htmlEsc(citation.version)} of ${htmlEsc(citation.date || '')}. GitHub’s “Cite this repository” reads the same file.</p>` +
    `<h3>BibTeX</h3>` + pre('citation', bibtex(citation), 'cite-bibtex') +
    `<h3>APA</h3>` + pre('citation', apa(citation), 'cite-apa') +
    `<p class="muted">The data is ${htmlEsc(citation.license)} licensed. Terms change without notice: say which version or date you used, and link back so readers can check the current entry.</p>` +
    `</div></main>`;
}
