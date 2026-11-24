// analytics.mjs — optional Google Analytics 4 behind a consent banner, decided at build time.
//
// The measurement ID comes from ONE place: the GA_MEASUREMENT_ID environment variable, which the deploy workflow
// (.github/workflows/pages.yml) fills from the repository variable of the same name. Empty or unset (every local build,
// every CI check, and the deploy until the owner sets the variable) means the build emits NO analytics code at all: no
// banner, no script, no extra CSP host, and the privacy page keeps saying the site sets no cookies.
//
// With an ID: every page gets site/consent.js (from lib/consent.client.js) and a "Cookie settings" control in the footer,
// the CSP allows exactly the Google hosts GA4 and Google signals need, and the privacy page describes what happens. Nothing
// from Google loads until the visitor allows analytics or advertising measurement (see consent.client.js).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ID_RE = /^G-[A-Z0-9]{4,16}$/;

/** The measurement ID from the environment, '' when unset. A malformed ID stops the build: it is written into HTML and JS. */
export function measurementId(env = process.env) {
  const id = String(env.GA_MEASUREMENT_ID ?? '').trim();
  if (!id) return '';
  if (!ID_RE.test(id)) throw new Error(`GA_MEASUREMENT_ID must look like G-XXXXXXXXXX, got ${JSON.stringify(id)}`);
  return id;
}

/**
 * Extra CSP sources GA4 needs, per directive; empty without an ID. The site's policy restricts only script-src and
 * connect-src (no default-src, img-src or frame-src), so image beacons need no entry. From Google's tag CSP guide
 * (developers.google.com/tag-platform/security/guides/csp): gtag.js from www.googletagmanager.com; measurement hits to
 * *.google-analytics.com / *.analytics.google.com; and, with Google signals (the advertising category), the
 * *.g.doubleclick.net and *.google.com endpoints that guide lists for Analytics with Ads features. Its country domains
 * (google.<TLD>) are image requests, already allowed; pagead2.googlesyndication.com is for Google Ads conversions,
 * which this site does not use.
 */
export function analyticsCspSources(id) {
  if (!id) return { script: '', connect: '' };
  return {
    script: ' https://www.googletagmanager.com',
    connect: ' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://*.g.doubleclick.net https://*.google.com',
  };
}

/** The first-party consent script with the ID written in, or null without an ID. */
export function consentScript(id) {
  if (!id) return null;
  const src = readFileSync(join(HERE, 'consent.client.js'), 'utf8');
  if (!src.includes("'__GA_MEASUREMENT_ID__'")) throw new Error('consent.client.js lost its measurement-ID placeholder');
  return src.replace("'__GA_MEASUREMENT_ID__'", JSON.stringify(id).replace(/"/g, "'"));
}

export const FOOTER_SETTINGS = '<span class="consent-settings" hidden> · <button type="button" class="consent-link" data-consent-open>Cookie settings</button></span>';

/**
 * Adds the footer "Cookie settings" control and the consent script to a finished page. Identity without an ID.
 * `prefix` is the page's path to the site root ('' for the home page, '../' and so on, '/' for 404.html).
 */
export function withAnalytics(html, id, prefix = '') {
  if (!id) return html;
  let out = html.replace(/(<p class="foot-legal">[\s\S]*?)(<\/p>)/, (_m, inner, close) => `${inner}${FOOTER_SETTINGS}${close}`);
  out = out.replace(/<\/body>/, `<script src="${prefix}consent.js" defer></script>\n</body>`);
  return out;
}
