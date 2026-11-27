// Pins the Content-Security-Policy every built page carries (lib/csp.mjs, wired in build.mjs). A change to the policy
// must change this file too, so loosening it is always a visible, reviewed diff.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentSecurityPolicy, inlineScriptHash, cspMeta, REDIRECT_CSP } from './lib/csp.mjs';
import { analyticsCspSources, CLOUDFLARE_WEB_ANALYTICS_CSP } from './lib/analytics.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const SITE = join(ROOT, 'site');

// The exact policy of a build without GA_MEASUREMENT_ID (every local and CI build).
const PINNED = "script-src 'self' 'sha256-ByZJaawcxAiK85qnD6nIc7iBFGzp/nf/DTzzA7Dl5Qs=' 'sha256-YzEhxvq2BwovGsg/RCjKkQdwf+LZmTjIkiQcjXCZMHc=' https://static.cloudflareinsights.com; " +
  "script-src-attr 'none'; connect-src 'self' https://raw.githubusercontent.com https://cloudflareinsights.com; font-src 'self'; manifest-src 'self'; " +
  "worker-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests";
const PINNED_REDIRECT = "default-src 'none'; base-uri 'none'; form-action 'none'";

const htmlFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  if (statSync(p).isDirectory()) return htmlFiles(p);
  return name.endsWith('.html') && !/^google[0-9a-f]+\.html$/.test(name) ? [p] : [];
});
const metaPolicies = (html) => [...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/g)].map((m) => m[1]);
const directives = (policy) => Object.fromEntries(policy.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
// The built pages are our own output, so a plain scan is enough: find each opening <script …> tag, then the next
// closing tag (case-insensitive, any whitespace before ">"). Not a sanitizer; nothing here filters untrusted HTML.
const inlineScripts = (html) => {
  const out = [];
  const lower = html.toLowerCase();
  let i = 0;
  while ((i = lower.indexOf('<script', i)) !== -1) {
    const tagEnd = lower.indexOf('>', i);
    const close = lower.indexOf('</script', tagEnd);
    if (tagEnd === -1 || close === -1) break;
    const attrs = html.slice(i + 7, tagEnd);
    if (!/\bsrc=/i.test(attrs) && !/type="application\/(ld\+)?json"/i.test(attrs)) out.push(html.slice(tagEnd + 1, close));
    i = lower.indexOf('>', close) + 1;
    if (i === 0) break;
  }
  return out;
};
// Every opening tag with its attributes (text inside <code> is HTML-escaped, so it holds no tags).
const openTags = (html) => [...html.matchAll(/<([a-z][a-z0-9-]*)(\s[^>]*)?>/gi)].map((m) => ({ name: m[1].toLowerCase(), attrs: m[2] || '', tag: m[0] }));

describe('lib/csp.mjs', () => {
  test('the hash of an inline script is the base64 sha256 of the text between its tags', () => {
    const body = "console.log('x')";
    assert.equal(inlineScriptHash(`<script>${body}</script>`), `'sha256-${createHash('sha256').update(body).digest('base64')}'`);
    assert.throws(() => inlineScriptHash('<script defer>x</script>'));
  });

  test('without a GA ID the policy is exactly the pinned one, with GA it only adds the Google hosts', () => {
    const index = readFileSync(join(SITE, 'index.html'), 'utf8');
    const from = index.indexOf('<!-- AUTOGEN:themeguard:start -->'), to = index.indexOf('<!-- AUTOGEN:themeguard:end -->');
    const guard = from !== -1 && to > from ? index.slice(from + '<!-- AUTOGEN:themeguard:start -->'.length, to).trim() : '';
    assert.ok(guard, 'the theme guard is injected into index.html');
    const notFound = `<script>${inlineScripts(readFileSync(join(SITE, '404.html'), 'utf8')).find((s) => s.includes("getElementById('path')"))}</script>`;
    const base = { inlineScripts: [guard, notFound], script: CLOUDFLARE_WEB_ANALYTICS_CSP.script, connect: CLOUDFLARE_WEB_ANALYTICS_CSP.connect };
    assert.equal(contentSecurityPolicy(base), PINNED);
    const ga = analyticsCspSources('G-TEST1234');
    const withGa = directives(contentSecurityPolicy({ ...base, script: base.script + ga.script, connect: base.connect + ga.connect }));
    const pinned = directives(PINNED);
    assert.deepEqual(Object.keys(withGa), Object.keys(pinned), 'GA adds no directive');
    for (const [k, v] of Object.entries(pinned)) {
      if (k === 'script-src' || k === 'connect-src') assert.deepEqual(withGa[k].slice(0, v.length), v, `${k} keeps every base source`);
      else assert.deepEqual(withGa[k], v, `${k} is unchanged by GA`);
    }
    assert.deepEqual(withGa['script-src'].slice(pinned['script-src'].length), ['https://www.googletagmanager.com']);
  });

  test('the redirect-stub policy is pinned', () => {
    assert.equal(REDIRECT_CSP, PINNED_REDIRECT);
    assert.equal(cspMeta(REDIRECT_CSP), `<meta http-equiv="Content-Security-Policy" content="${PINNED_REDIRECT}">`);
  });
});

describe('every built page', () => {
  const files = htmlFiles(SITE);
  const GA = !!process.env.GA_MEASUREMENT_ID;
  // In push mode a branch does not commit site/: CI rebuilds it before the suite (verify.yml), so there a stale page is a
  // real failure. Locally, a checkout whose site/ predates a policy change is only told to rebuild.
  const stale = !process.env.CI && !GA && metaPolicies(readFileSync(join(SITE, 'index.html'), 'utf8'))[0] !== PINNED;
  const opts = stale ? { skip: 'site/ was built before the current policy: run `npm run build` first' } : {};

  test('carries exactly one CSP meta tag, in <head> before any script: the site policy or, on a redirect stub, the strict one', opts, () => {
    assert.ok(files.length > 100, 'the site is built');
    for (const f of files) {
      const rel = relative(ROOT, f);
      const html = readFileSync(f, 'utf8');
      const policies = metaPolicies(html);
      assert.equal(policies.length, 1, `${rel}: one CSP meta tag`);
      const head = html.slice(0, html.indexOf('</head>'));
      const at = head.indexOf('http-equiv="Content-Security-Policy"');
      assert.ok(at > 0, `${rel}: the CSP is in <head>`);
      assert.ok(head.indexOf('<script') === -1 || head.indexOf('<script') > at, `${rel}: the CSP precedes every script`);
      if (/<meta http-equiv="refresh"/.test(html)) assert.equal(policies[0], PINNED_REDIRECT, `${rel}: redirect stub policy`);
      else if (!GA) assert.equal(policies[0], PINNED, `${rel}: site policy`);
    }
  });

  test('every inline script is pinned by hash, and no element carries an inline event handler or javascript: URL', opts, () => {
    for (const f of files) {
      const rel = relative(ROOT, f);
      const html = readFileSync(f, 'utf8');
      const scriptSrc = directives(metaPolicies(html)[0])['script-src'] || [];
      for (const body of inlineScripts(html)) {
        const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
        assert.ok(scriptSrc.includes(hash), `${rel}: inline script ${body.slice(0, 40)}… is pinned (${hash})`);
      }
      for (const { tag, attrs } of openTags(html)) assert.doesNotMatch(attrs, /\son[a-z]+\s*=/i, `${rel}: no inline event handler in ${tag}`);
      assert.doesNotMatch(html, /(href|src|action)="javascript:/i, `${rel}: no javascript: URL`);
    }
  });

  test('no mixed content and no third-party script, stylesheet or font: links opening a new tab carry rel=noopener', () => {
    for (const f of files) {
      const rel = relative(ROOT, f);
      const html = readFileSync(f, 'utf8');
      assert.doesNotMatch(html, /\s(src|srcset|action|poster|data)="http:\/\//i, `${rel}: no http:// subresource`);
      for (const { name, tag } of openTags(html)) {
        if (!['script', 'link', 'img', 'iframe'].includes(name)) continue;
        const url = /\s(?:src|href)="((?:https?:)?\/\/[^"]+)"/.exec(tag)?.[1];
        if (!url || /\brel="(canonical|alternate|me)"/.test(tag)) continue;
        assert.ok(new URL(url, 'https://freellmapihub.com/').host === 'freellmapihub.com', `${rel}: third-party subresource needs SRI or self-hosting: ${tag}`);
      }
      for (const { name, attrs, tag } of openTags(html)) if (name === 'a' && /target="_blank"/i.test(attrs)) assert.match(attrs, /\brel="[^"]*\bnoopener\b/, `${rel}: ${tag}`);
    }
  });
});
