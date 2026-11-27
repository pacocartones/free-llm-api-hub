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
const inlineScripts = (html) => [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .filter((m) => !/\bsrc=/.test(m[1] || '') && !/type="application\/(ld\+)?json"/.test(m[1] || ''))
  .map((m) => m[2]);

describe('lib/csp.mjs', () => {
  test('the hash of an inline script is the base64 sha256 of the text between its tags', () => {
    const body = "console.log('x')";
    assert.equal(inlineScriptHash(`<script>${body}</script>`), `'sha256-${createHash('sha256').update(body).digest('base64')}'`);
    assert.throws(() => inlineScriptHash('<script defer>x</script>'));
  });

  test('without a GA ID the policy is exactly the pinned one, with GA it only adds the Google hosts', () => {
    const guard = readFileSync(join(SITE, 'index.html'), 'utf8').match(/<!-- AUTOGEN:themeguard:start -->\s*(<script>[\s\S]*?<\/script>)/)?.[1];
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

  test('carries exactly one CSP meta tag, in <head> before any script: the site policy or, on a redirect stub, the strict one', () => {
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

  test('every inline script is pinned by hash, and no element carries an inline event handler or javascript: URL', () => {
    for (const f of files) {
      const rel = relative(ROOT, f);
      const html = readFileSync(f, 'utf8');
      const scriptSrc = directives(metaPolicies(html)[0])['script-src'] || [];
      for (const body of inlineScripts(html)) {
        const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
        assert.ok(scriptSrc.includes(hash), `${rel}: inline script ${body.slice(0, 40)}… is pinned (${hash})`);
      }
      assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<code[\s\S]*?<\/code>/g, ''), /<[a-z][^>]*\son[a-z]+\s*=/i, `${rel}: no inline event handler`);
      assert.doesNotMatch(html, /(href|src|action)="javascript:/i, `${rel}: no javascript: URL`);
    }
  });

  test('no mixed content and no third-party script, stylesheet or font: links opening a new tab carry rel=noopener', () => {
    for (const f of files) {
      const rel = relative(ROOT, f);
      const html = readFileSync(f, 'utf8');
      assert.doesNotMatch(html, /\s(src|srcset|action|poster|data)="http:\/\//i, `${rel}: no http:// subresource`);
      for (const [tag] of html.matchAll(/<(script|link|img|iframe)\s[^>]*>/g)) {
        const url = /\s(?:src|href)="((?:https?:)?\/\/[^"]+)"/.exec(tag)?.[1];
        if (!url || /\brel="(canonical|alternate|me)"/.test(tag)) continue;
        assert.ok(new URL(url, 'https://freellmapihub.com/').host === 'freellmapihub.com', `${rel}: third-party subresource needs SRI or self-hosting: ${tag}`);
      }
      for (const [a] of html.matchAll(/<a\s[^>]*target="_blank"[^>]*>/g)) assert.match(a, /\brel="[^"]*\bnoopener\b/, `${rel}: ${a}`);
    }
  });
});
