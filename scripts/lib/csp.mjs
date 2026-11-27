// csp.mjs — the Content-Security-Policy every generated page carries in a <meta http-equiv> tag.
//
// A meta policy cannot carry frame-ancestors, report-uri or sandbox: those (and HSTS, X-Frame-Options and the other
// response headers) are set at the edge in Cloudflare, outside this repository. What a meta policy can do, it does here:
//
//   script-src       'self' plus each inline script pinned by its sha256, computed from the exact bytes the build writes
//                    (so editing an inline script can no longer break the page silently), plus the analytics hosts.
//   script-src-attr  'none': no inline event handler (onclick="…") can run; the site has none.
//   connect-src      'self', raw.githubusercontent.com (explorer.js's data fallback) and the analytics endpoints.
//   font-src         'self': the fonts are self-hosted in site/fonts/.
//   manifest-src     'self'; worker-src 'none' (the site runs no workers); object-src 'none'.
//   base-uri 'self'; form-action 'self' (every form submits to this site); upgrade-insecure-requests.
//
// Deliberately absent: default-src, style-src and img-src. Inline style="" attributes and <style> blocks are used on every
// page, and with a Google Analytics ID gtag.js sends image beacons to google.<country TLD> hosts that cannot be listed.
// frame-src is absent because Google signals may add a td.doubleclick.net frame.

import { createHash } from 'node:crypto';

/** The CSP hash source of one inline <script>…</script> element (the hash covers the text between the tags). */
export function inlineScriptHash(scriptElement) {
  const el = String(scriptElement);
  const open = '<script>', close = '</script>';
  if (!el.startsWith(open) || !el.endsWith(close) || el.length < open.length + close.length) {
    throw new Error('inlineScriptHash expects a bare <script>…</script> element');
  }
  const body = el.slice(open.length, el.length - close.length);
  return `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
}

/**
 * The policy string. `inlineScripts` are the bare inline <script> elements the site writes; `script` and `connect` are
 * extra host sources (space-separated, each with a leading space, as lib/analytics.mjs returns them).
 */
export function contentSecurityPolicy({ inlineScripts = [], script = '', connect = '' } = {}) {
  const hashes = [...new Set(inlineScripts.map(inlineScriptHash))];
  return [
    `script-src 'self'${hashes.map((h) => ` ${h}`).join('')}${script}`,
    `script-src-attr 'none'`,
    `connect-src 'self' https://raw.githubusercontent.com${connect}`,
    `font-src 'self'`,
    `manifest-src 'self'`,
    `worker-src 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    'upgrade-insecure-requests',
  ].join('; ');
}

/** The meta element for a policy string. */
export const cspMeta = (policy) => `<meta http-equiv="Content-Security-Policy" content="${policy}">`;

/**
 * Redirect stubs (meta refresh + one link) load nothing at all, so they get the strictest policy: no scripts, styles,
 * images, fonts or connections; a meta refresh is a navigation and is not governed by CSP.
 */
export const REDIRECT_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'";
