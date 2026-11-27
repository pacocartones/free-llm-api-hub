// provider-badges.mjs — the provider badge kit: one small SVG per provider at /badge/<slug>.svg (and -dark.svg), a
// generic "Listed on Free LLM API Hub" badge, and the /badges/ page with copy-paste snippets that link back to /p/<slug>.
//
// The badge says only what the dataset says: the kind of offer (an ongoing free tier or a trial credit) and the date of
// our last verification, e.g. "Free tier · verified 25 Nov 2026". It is drawn in the Cálida receipt style (the same
// perforated ticket as site/badge-verified.svg, lib/badge-svg.mjs), in a light and a dark variant, with no external
// font, image or script. Pure and deterministic: the same provider record gives the same bytes, so the files are pinned
// in derived-fingerprints.json and a change in the data shows up in the badge on the next build.

import { escapeAttr, escapeHtml, escapeText } from './html.mjs';
import { humanDate } from './dates.mjs';

export const BADGES_PATH = '/badges/';
/** The directory of the SVG files on the site (/badge/<slug>.svg). */
export const BADGE_DIR = 'badge';
/** The file name of the generic badge; no provider may use it as a slug (the build checks). */
export const LISTED_SLUG = 'listed';

// Cálida tokens (docs/brand.md): the seal fill and the accent, per theme. The ink reaches 4.5:1 on its fill in both.
export const BADGE_THEMES = Object.freeze({
  light: Object.freeze({ fill: '#ffebd9', ink: '#9c4a00', edge: '#f0e2db' }),
  dark: Object.freeze({ fill: '#2e2119', ink: '#ffb25c', edge: '#352822' }),
});

/** '2026-11-25' → '25 Nov 2026'; anything else → ''. */
export const badgeDate = (iso) => humanDate(iso) || '';

/** What the badge of a provider states, from the record alone. */
export function providerBadgeState(p) {
  const kind = p.category === 'ongoing' ? 'free' : 'trial';
  const offer = kind === 'free' ? 'Free tier' : 'Trial credit';
  const date = p.verified === true ? badgeDate(p.last_verified) : '';
  const status = date ? `verified ${date}` : 'not yet verified';
  return { kind, offer, verified: Boolean(date), date, status, text: `${offer} · ${status}` };
}

/** The accessible name of a provider badge: who, what, where. */
export const providerBadgeTitle = (p) => `${p.name} on Free LLM API Hub: ${providerBadgeState(p).text}`;

const FONT_PX = 11;
// Monospace text: every character advances 0.6 em, so the width is exact for any monospace font the reader has.
export const monoWidth = (s) => Math.round([...String(s)].length * 0.6 * FONT_PX);
const STUB = 19;
const H = 20;

// The ticket: a rounded rectangle with a semicircular notch on each side, a dashed cut line after the stub, a mark in the
// stub (a check when verified, a small open circle otherwise) and one line of text. Width follows the text.
function ticket({ text, title, theme, mark }) {
  const t = BADGE_THEMES[theme];
  if (!t) throw new Error(`badge theme not known: ${theme}`);
  const tw = monoWidth(text);
  const width = STUB + 6 + tw + 9;
  const markSvg = mark === 'check'
    ? `<path d="M7 10.3l2.3 2.3 4.3-4.7" fill="none" stroke="${t.ink}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<circle cx="10" cy="10" r="3" fill="none" stroke="${t.ink}" stroke-width="1.4"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" role="img" aria-label="${escapeAttr(title)}"><title>${escapeAttr(title)}</title>` +
    `<mask id="n"><rect width="${width}" height="${H}" fill="#fff"/><circle cy="10" r="4" fill="#000"/><circle cx="${width}" cy="10" r="4" fill="#000"/></mask>` +
    `<rect width="${width}" height="${H}" rx="3" fill="${t.fill}" mask="url(#n)"/>` +
    `<path d="M${STUB} 3.5V16.5" stroke="${t.ink}" stroke-width="1.2" stroke-dasharray="2 1.6"/>` +
    markSvg +
    `<text x="${STUB + 6 + tw / 2}" y="14" fill="${t.ink}" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,'DejaVu Sans Mono',monospace" font-weight="500" font-size="${FONT_PX}" textLength="${tw}" lengthAdjust="spacingAndGlyphs">${escapeAttr(text)}</text></svg>\n`;
  return { svg, width, height: H };
}

/** { svg, width, height, text } of a provider's badge in a theme ('light' | 'dark'). */
export function providerBadgeSvg(p, theme = 'light') {
  const s = providerBadgeState(p);
  return { ...ticket({ text: s.text, title: providerBadgeTitle(p), theme, mark: s.verified ? 'check' : 'open' }), text: s.text };
}

export const LISTED_TEXT = 'Listed on Free LLM API Hub';
/** { svg, width, height, text } of the generic badge. */
export function listedBadgeSvg(theme = 'light') {
  return { ...ticket({ text: LISTED_TEXT, title: LISTED_TEXT, theme, mark: 'check' }), text: LISTED_TEXT };
}

/** The site path of a badge file: '/badge/groq.svg', '/badge/groq-dark.svg'. */
export const badgePath = (slug, theme = 'light') => `/${BADGE_DIR}/${slug}${theme === 'dark' ? '-dark' : ''}.svg`;

// Snippets. The alt text names the provider and the site but no date, so markup copied today is not wrong next month.
export const providerBadgeAlt = (p) => `${p.name} on Free LLM API Hub`;

export const providerBadgeSnippetMarkdown = (p, site, theme = 'light') =>
  `[![${providerBadgeAlt(p)}](${site}${badgePath(p.slug, theme)})](${site}/p/${p.slug})`;

/** HTML that follows the reader's colour scheme: the dark file under prefers-color-scheme: dark, the light one otherwise. */
export const providerBadgeSnippetHtml = (p, site) =>
  `<a href="${site}/p/${p.slug}"><picture>` +
  `<source media="(prefers-color-scheme: dark)" srcset="${site}${badgePath(p.slug, 'dark')}">` +
  `<img src="${site}${badgePath(p.slug)}" alt="${escapeHtml(providerBadgeAlt(p))}" height="20">` +
  `</picture></a>`;

export const listedSnippetMarkdown = (site) => `[![${LISTED_TEXT}](${site}${badgePath(LISTED_SLUG)})](${site}/)`;
export const listedSnippetHtml = (site) =>
  `<a href="${site}/"><picture>` +
  `<source media="(prefers-color-scheme: dark)" srcset="${site}${badgePath(LISTED_SLUG, 'dark')}">` +
  `<img src="${site}${badgePath(LISTED_SLUG)}" alt="${LISTED_TEXT}" height="20">` +
  `</picture></a>`;

export function badgesTitle() { return 'Provider badges: embed a verified free-tier badge · Free LLM API Hub'; }
export function badgesDescription(n) {
  return `Copy-paste badges for ${n} free AI API providers: a small SVG that shows the free tier or trial credit and the date we last verified it, linking to the provider's page.`;
}

const pre = (kind, text) => `<pre data-snippet="${kind}"><code>${escapeText(text)}</code></pre>`;
const img = (prefix, slug, theme, alt, width, eager = false) =>
  `<img src="${prefix}${badgePath(slug, theme).slice(1)}" alt="${escapeHtml(alt)}" width="${width}" height="20"${eager ? '' : ' loading="lazy" decoding="async"'}>`;

/** The /badges/ page body: how to use the badges, the rules, the generic badge and one block per provider. */
export function badgesMainHtml({ pageHero, site, prefix = '../', providers, repo, slaDays }) {
  const sorted = [...providers].sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
  const listedL = listedBadgeSvg('light');
  const listedD = listedBadgeSvg('dark');
  const correction = `${repo}/issues/new?template=inaccuracy.yml`;
  const providerBlock = (p) => {
    const l = providerBadgeSvg(p, 'light');
    const d = providerBadgeSvg(p, 'dark');
    return `<section class="badge-kit" id="${escapeHtml(p.slug)}" aria-labelledby="b-${escapeHtml(p.slug)}">` +
      `<h3 id="b-${escapeHtml(p.slug)}"><a href="${prefix}p/${escapeHtml(p.slug)}">${escapeHtml(p.name)}</a></h3>` +
      `<p class="badge-previews"><span class="badge-swatch badge-swatch-light">${img(prefix, p.slug, 'light', providerBadgeTitle(p), l.width)}</span>` +
      `<span class="badge-swatch badge-swatch-dark">${img(prefix, p.slug, 'dark', `${providerBadgeTitle(p)} (dark)`, d.width)}</span></p>` +
      `<p class="muted">Markdown</p>` + pre('badge', providerBadgeSnippetMarkdown(p, site)) +
      `<p class="muted">HTML (follows the reader’s light or dark mode)</p>` + pre('badge', providerBadgeSnippetHtml(p, site)) +
      `</section>`;
  };
  return pageHero({
    crumbs: `<a href="${prefix}">Home</a> / <a href="${prefix}embed/">Use the data</a> / Badges`,
    h1: 'Provider badges',
    lede: `A small badge that shows a provider’s free tier or trial credit and the day we last verified it against the provider’s own docs. It updates by itself when the data changes, and it links to the provider’s page here, where every claim has its source.`,
  }) +
    `<main id="main"><div class="wrap prose">` +
    `<nav class="colls" aria-label="On this page"><a href="#how">How to use</a><a href="#rules">Rules</a><a href="#correction">Corrections</a><a href="#listed">Generic badge</a><a href="#providers">Per provider</a></nav>` +
    `<h2 id="how">How to use a badge</h2>` +
    `<p>Each provider has a badge at <code>${site}/badge/&lt;slug&gt;.svg</code> and a dark variant at <code>${site}/badge/&lt;slug&gt;-dark.svg</code>. They are plain SVG files served by this site: no script, no cookie, no external font and no tracking. The text comes from the dataset on every build: the offer (<strong>Free tier</strong> for an ongoing free tier, <strong>Trial credit</strong> for a one-time credit) and the date of our last verification.</p>` +
    `<ul><li><strong>A provider</strong> can show it in its docs, pricing page or README.</li>` +
    `<li><strong>A project built on a provider</strong> can show it next to the provider it uses, so readers can check the free tier themselves.</li></ul>` +
    `<p>Copy the Markdown for a README or the HTML for a web page. Keep the link to the provider’s page here: it is where the badge’s claim is sourced and dated.</p>` +
    `<h2 id="rules">Rules</h2>` +
    `<ul>` +
    `<li>A badge reflects <strong>only our verification</strong> of the provider’s public documentation on the date it shows. It is not a review, a guarantee of uptime or limits, or a statement by the provider.</li>` +
    `<li>It is <strong>not an endorsement</strong>. Do not describe it as “endorsed”, “certified”, “approved”, “official” or “partner”, and do not suggest that Free LLM API Hub recommends, sponsors or works with the provider.</li>` +
    `<li>Use the file as served. Do not edit its text or colours, copy it to change the date, or put a stale copy on your own server: the live file is the one that stays true.</li>` +
    `<li>If an offer changes, the badge changes with the data: a free tier that becomes a trial credit reads <strong>Trial credit</strong>, and an entry we could not confirm reads <strong>not yet verified</strong>. If a provider leaves the dataset, its badge stops resolving; please remove it then.</li>` +
    `<li>Badges are free to use under the dataset’s MIT licence. Nobody pays for a badge, and having one changes nothing in the ranking.</li>` +
    `</ul>` +
    `<h2 id="correction">Request a correction</h2>` +
    `<p>If a badge or the page behind it is wrong, <a href="${correction}">open an inaccuracy report</a> with a link to the provider’s own docs. We check it against the source, and once the data is fixed the badge follows on the next build. See the <a href="${prefix}methodology/">methodology</a> for how entries are verified; each entry is due for a fresh check within ${slaDays} days.</p>` +
    `<h2 id="listed">Generic badge</h2>` +
    `<p>For a page that lists or uses several providers, or that links to the dataset as a whole.</p>` +
    `<p class="badge-previews"><span class="badge-swatch badge-swatch-light">${img(prefix, LISTED_SLUG, 'light', LISTED_TEXT, listedL.width, true)}</span>` +
    `<span class="badge-swatch badge-swatch-dark">${img(prefix, LISTED_SLUG, 'dark', `${LISTED_TEXT} (dark)`, listedD.width, true)}</span></p>` +
    `<p class="muted">Markdown</p>` + pre('badge', listedSnippetMarkdown(site)) +
    `<p class="muted">HTML (follows the reader’s light or dark mode)</p>` + pre('badge', listedSnippetHtml(site)) +
    `<h2 id="providers">Badges per provider</h2>` +
    `<p>${sorted.length} providers, in alphabetical order. Each provider’s page links to its own block here. For the dark variant in Markdown, add <code>-dark</code> before <code>.svg</code>.</p>` +
    `<nav class="colls" aria-label="Providers">${sorted.map((p) => `<a href="#${escapeHtml(p.slug)}">${escapeHtml(p.name)}</a>`).join('')}</nav>` +
    sorted.map(providerBlock).join('') +
    `<p class="muted">Looking for the widget, the shields.io endpoint badges or the data files? See <a href="${prefix}embed/">Use the data</a>.</p>` +
    `</div></main>`;
}
