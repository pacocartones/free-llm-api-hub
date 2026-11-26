// find-page.mjs — the markup of /find/ ("Find my free API"): the questions as a form, the live result count, the
// results area that site/find.js fills, the no-JavaScript fallback and the structured data. Pure: the build passes in
// what it needs, so the page is deterministic and the tests can render it without a build.
//
// The questions and their answers come from lib/find.mjs (USES, CONSTRAINTS), the same table the filter reads, so a
// question cannot ask one thing while the filter applies another.

import { USES, CONSTRAINTS, explorerHref } from './find.mjs';
import { websiteRef, SITE_NAME } from './site-entity.mjs';
import { escapeAttr } from './html.mjs';
import { isoDateTime } from './structured-data.mjs';

export const FIND_PATH = '/find/';
export const FIND_TITLE = 'Find my free API: a shortlist of free LLM APIs that fit you · Free LLM API Hub';
export const FIND_DESC = 'Answer six quick questions (what you build, card, phone, commercial use, training, OpenAI compatibility) and get a ranked shortlist of free LLM APIs, with sources.';
export const FIND_H1 = 'Find my free API';

// One question: a fieldset of radios. The legend is the question; each option is a real <label>, so the whole row is
// a click and keyboard target (arrow keys move inside the group, as for any radio group).
function fieldset(step, total, key, legend, options, help = '') {
  const opts = options.map((o) =>
    `<label class="find-opt"><input type="radio" name="${key}" value="${escapeAttr(o.value)}"><span class="find-opt-label">${escapeAttr(o.label)}</span>` +
    (o.hint ? `<span class="find-opt-hint">${escapeAttr(o.hint)}</span>` : '') + `</label>`).join('');
  return `<fieldset class="find-q" id="find-q-${key}" data-step="${step}" tabindex="-1"${step ? ' hidden' : ''}>` +
    `<legend><span class="find-step">Question ${step + 1} of ${total}</span> ${escapeAttr(legend)}</legend>` +
    (help ? `<p class="find-help muted">${escapeAttr(help)}</p>` : '') +
    `<div class="find-opts">${opts}</div></fieldset>`;
}

/** The questions, in order: what for, then the yes/no constraints. */
export function questionsHtml() {
  const total = 1 + CONSTRAINTS.length;
  return fieldset(0, total, 'use', 'What do you want to build?', USES, 'Pick one. You can change any answer later.') +
    CONSTRAINTS.map((c, i) => fieldset(i + 1, total, c.key, c.legend,
      [{ value: 'yes', label: c.yes }, { value: 'no', label: c.no }],
      'Skip it if it does not matter to you.')).join('');
}

// Without JavaScript the wizard cannot filter, so the page says so and links to the explorer with the filters that the
// most common answers would set (the same links lib/find.mjs builds for the results).
const NOSCRIPT_PRESETS = [
  ['Chat, no card', { use: 'chat', card: 'no' }],
  ['Chat, no card and no phone', { use: 'chat', card: 'no', phone: 'no' }],
  ['Code, OpenAI-compatible', { use: 'code', openai: 'yes' }],
  ['Embeddings', { use: 'embeddings' }],
  ['Speech', { use: 'speech' }],
  ['Image generation', { use: 'image' }],
  ['OCR and documents', { use: 'ocr' }],
];

/** The page body: hero, form, live count, results and the "how it ranks" notes. `heroHtml` is the build's pageHero(). */
export function findMainHtml({ pageHero, total, verified }) {
  const prefix = '../';
  return pageHero({
    crumbs: `<a href="${prefix}">Home</a> / <a href="${prefix}#explorer">Providers</a> / ${FIND_H1}`,
    h1: FIND_H1,
    lede: `Six quick questions, one ranked shortlist. Every answer filters ${total} tracked providers (${verified} verified against their own docs) exactly as the explorer does, and anything we could not confirm is shown as <em>not confirmed</em>, never as a yes.`,
  }) +
    `<main id="main"><div class="wrap find-wrap">` +
    `<noscript><div class="find-noscript"><p><strong>This finder needs JavaScript.</strong> The same filters work in the <a href="${prefix}#explorer">provider explorer</a>. Common starting points:</p>` +
    `<ul>${NOSCRIPT_PRESETS.map(([label, a]) => `<li><a href="${escapeAttr(explorerHref(a, prefix))}">${escapeAttr(label)}</a></li>`).join('')}</ul></div></noscript>` +
    `<form id="find-form" class="find-form" novalidate hidden aria-describedby="find-count">` +
    questionsHtml() +
    `<p id="find-error" class="find-error" role="alert"></p>` +
    `<div class="find-nav"><button type="button" class="btn ghost" id="find-back" hidden>← Back</button>` +
    `<button type="submit" class="btn primary" id="find-next">Next</button>` +
    `<button type="button" class="btn ghost" id="find-skip">Skip to results</button></div>` +
    `</form>` +
    // One permanent live region: the number of matching providers, rewritten on every answer.
    `<p id="find-count" class="find-count" role="status" aria-live="polite" aria-atomic="true"></p>` +
    `<section id="find-results" class="find-results" aria-labelledby="find-results-h" hidden>` +
    `<h2 id="find-results-h" tabindex="-1">Your shortlist</h2>` +
    `<p class="find-summary"><span id="find-summary"></span></p>` +
    `<div class="find-tools"><button type="button" class="btn ghost" id="find-edit">Change answers</button>` +
    `<button type="button" class="btn ghost" id="find-share">Copy link to these results</button>` +
    `<a class="btn ghost" id="find-explorer" href="${prefix}#explorer">Open in the explorer</a>` +
    `<span id="find-share-status" class="sr-only" role="status"></span></div>` +
    `<ol class="find-list" id="find-list"></ol>` +
    `<p class="find-more"><button type="button" class="btn ghost" id="find-all" hidden></button></p>` +
    `<p class="find-empty" id="find-empty" hidden></p>` +
    `<details class="find-maybe" id="find-maybe" hidden><summary id="find-maybe-sum"></summary>` +
    `<p class="muted">These match what you build and contradict none of your answers, but at least one answer is <em>not confirmed</em> in the dataset: the provider's pages do not say it, or say it only under a condition. Check the flag marked “not confirmed” on the provider's own page before you rely on it.</p>` +
    `<ol class="find-list" id="find-maybe-list"></ol></details>` +
    `</section>` +
    `<section class="find-how" aria-labelledby="find-how-h"><h2 id="find-how-h">How the shortlist is made</h2>` +
    `<ul>` +
    `<li><strong>Same rules as the explorer.</strong> Each answer turns on one of the explorer's filters, and the order is its <a href="${prefix}#explorer">Recommended</a> sort. “Open in the explorer” shows the same providers.</li>` +
    `<li><strong>Not confirmed is not yes.</strong> A requirement nobody has confirmed (for example “card: not confirmed”) never counts as meeting your answer; those providers are listed apart.</li>` +
    `<li><strong>Every fact has a source.</strong> Each provider page links the page its facts were read from and the day they were checked. Terms change: confirm on the provider's own docs before you build. See the <a href="${prefix}methodology/">methodology</a>.</li>` +
    `<li><strong>Your answers stay in the address.</strong> They live after the <code>#</code> of the URL, so the link is shareable and nothing is sent to a server.</li>` +
    `</ul></section>` +
    `</div></main>`;
}

/** WebApplication + BreadcrumbList, in the style of the site's other pages. No Offer and no rating. */
export function findJsonLd({ site, asof }) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: 'Find my free API',
        url: `${site}${FIND_PATH}`,
        description: FIND_DESC,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Any (runs in the browser)',
        browserRequirements: 'Requires JavaScript',
        isAccessibleForFree: true,
        dateModified: isoDateTime(asof),
        isPartOf: websiteRef(site),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${site}/` },
          { '@type': 'ListItem', position: 2, name: 'Providers', item: `${site}/#explorer` },
          { '@type': 'ListItem', position: 3, name: FIND_H1, item: `${site}${FIND_PATH}` },
        ],
      },
    ],
  });
}
