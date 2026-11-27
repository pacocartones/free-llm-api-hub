// The provider badge kit (lib/provider-badges.mjs): every provider has a light and a dark SVG at /badge/<slug>.svg that
// is valid, small, accessible and self-contained; its text follows the data (offer and verification date); the /badges/
// page has a block per provider whose snippets point at files and pages that exist; provider pages link to it; and it
// is in the sitemap and llms.txt.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateTree } from './lib/private-tree.mjs';
import {
  badgeDate, providerBadgeState, providerBadgeSvg, listedBadgeSvg, providerBadgeSnippetMarkdown, providerBadgeSnippetHtml,
  listedSnippetMarkdown, listedSnippetHtml, badgePath, BADGE_THEMES, LISTED_SLUG, LISTED_TEXT, monoWidth,
} from './lib/provider-badges.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://freellmapihub.com';

// A well-formedness check small enough to need no dependency: one root <svg> with the SVG namespace, every tag closed in
// order, no script, no external reference, no foreign font.
function svgErrors(svg) {
  const errors = [];
  if (!/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="20" viewBox="0 0 \d+ 20" role="img" aria-label="[^"]+"><title>[^<]+<\/title>/.test(svg)) errors.push('root, size, role, aria-label or title');
  const stack = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)\b[^>]*?(\/?)>/g)) {
    const [, close, name, self] = m;
    if (self) continue;
    if (close) { if (stack.pop() !== name) errors.push(`unbalanced </${name}>`); } else stack.push(name);
  }
  if (stack.length) errors.push(`unclosed ${stack.join(',')}`);
  if (/<script|on[a-z]+=|href=|url\((?!#)|@import|@font-face|<image|<foreignObject/i.test(svg)) errors.push('script, handler or external reference');
  if (/[<&](?![a-zA-Z/#!]|amp;|lt;|gt;|quot;)/.test(svg.replace(/<[^>]+>/g, ''))) errors.push('unescaped text');
  return errors;
}

const groqLike = { slug: 'acme', name: 'Acme <AI>', category: 'ongoing', verified: true, last_verified: '2026-11-27' };

describe('provider badges, the pure functions', () => {
  test('badgeDate writes a date the way a person reads it, and nothing for a bad one', () => {
    assert.equal(badgeDate('2026-11-27'), '27 Nov 2026');
    assert.equal(badgeDate('2026-01-05'), '5 Jan 2026');
    assert.equal(badgeDate('2026-13-01'), '');
    assert.equal(badgeDate(null), '');
  });

  test('the text follows the data: offer from category, date from last_verified, and no date when not verified', () => {
    assert.equal(providerBadgeState(groqLike).text, 'Free tier · verified 27 Nov 2026');
    assert.equal(providerBadgeState({ ...groqLike, category: 'trial' }).text, 'Trial credit · verified 27 Nov 2026');
    assert.equal(providerBadgeState({ ...groqLike, last_verified: '2026-12-02' }).text, 'Free tier · verified 2 Dec 2026');
    assert.equal(providerBadgeState({ ...groqLike, verified: false }).text, 'Free tier · not yet verified');
    assert.equal(providerBadgeState({ ...groqLike, last_verified: null }).text, 'Free tier · not yet verified');
  });

  test('the SVG is valid, escaped, deterministic, sized to its text and drawn in the Cálida colours of its theme', () => {
    for (const theme of ['light', 'dark']) {
      const a = providerBadgeSvg(groqLike, theme);
      assert.equal(a.svg, providerBadgeSvg(groqLike, theme).svg, 'same input, same bytes');
      assert.deepEqual(svgErrors(a.svg), []);
      assert.ok(a.svg.includes('Acme &lt;AI&gt; on Free LLM API Hub: Free tier · verified 27 Nov 2026'), 'escaped accessible name');
      assert.ok(a.svg.includes(`fill="${BADGE_THEMES[theme].fill}"`) && a.svg.includes(`fill="${BADGE_THEMES[theme].ink}"`), `${theme} colours`);
      assert.equal(a.width, 19 + 6 + monoWidth(a.text) + 9);
      assert.ok(a.svg.length < 1500, `small: ${a.svg.length} bytes`);
    }
    assert.notEqual(providerBadgeSvg(groqLike, 'light').svg, providerBadgeSvg(groqLike, 'dark').svg);
    assert.match(providerBadgeSvg(groqLike).svg, /<path d="M7 10\.3/, 'a check when verified');
    assert.doesNotMatch(providerBadgeSvg({ ...groqLike, verified: false }).svg, /<path d="M7 10\.3/, 'no check when not verified');
    assert.throws(() => providerBadgeSvg(groqLike, 'sepia'), /theme not known/);
  });

  test('snippets link the badge to the provider page and never say endorsed', () => {
    const md = providerBadgeSnippetMarkdown(groqLike, SITE);
    assert.equal(md, `[![Acme <AI> on Free LLM API Hub](${SITE}/badge/acme.svg)](${SITE}/p/acme)`);
    const html = providerBadgeSnippetHtml(groqLike, SITE);
    assert.ok(html.startsWith(`<a href="${SITE}/p/acme">`));
    assert.ok(html.includes(`srcset="${SITE}/badge/acme-dark.svg"`) && html.includes(`src="${SITE}/badge/acme.svg"`));
    assert.ok(html.includes('alt="Acme &lt;AI&gt; on Free LLM API Hub"'));
    for (const s of [md, html, listedSnippetMarkdown(SITE), listedSnippetHtml(SITE)]) assert.doesNotMatch(s, /endorse|certif|official|partner/i);
    assert.equal(badgePath('x', 'dark'), '/badge/x-dark.svg');
    assert.deepEqual(svgErrors(listedBadgeSvg('dark').svg), []);
    assert.equal(listedBadgeSvg().text, LISTED_TEXT);
  });
});

describe('provider badges, the built site', () => {
  let ROOT, providers;
  const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
  before(() => {
    ROOT = privateTree(REPO);
    execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' });
    providers = JSON.parse(read('data/providers.json')).providers;
  });

  test('every provider has a valid light and dark SVG whose text reflects its record, and nothing else is in /badge/', () => {
    const expected = new Set([`${LISTED_SLUG}.svg`, `${LISTED_SLUG}-dark.svg`]);
    for (const p of providers) {
      const state = providerBadgeState(p);
      for (const theme of ['light', 'dark']) {
        const rel = `site${badgePath(p.slug, theme)}`;
        expected.add(rel.split('/').pop());
        assert.ok(existsSync(join(ROOT, rel)), `${rel} is built`);
        const svg = read(rel);
        assert.deepEqual(svgErrors(svg), [], rel);
        assert.equal(svg, providerBadgeSvg(p, theme).svg, `${rel} is the generator's output`);
        assert.ok(svg.includes(`>${state.text}</text>`), `${rel}: text "${state.text}"`);
        if (p.verified === true && p.last_verified) assert.ok(svg.includes(badgeDate(p.last_verified)), `${rel}: shows ${p.last_verified}`);
        assert.ok(svg.includes(p.category === 'ongoing' ? 'Free tier' : 'Trial credit'), `${rel}: offer follows category`);
      }
    }
    assert.deepEqual(new Set(readdirSync(join(ROOT, 'site/badge'))), expected);
  });

  test('/badges/ has a block per provider, and every snippet link and image resolves to a built page or file', () => {
    const html = read('site/badges/index.html');
    assert.ok(html.includes(`<link rel="canonical" href="${SITE}/badges/">`));
    const local = (url) => {
      assert.ok(url.startsWith(SITE + '/'), url);
      const t = join(ROOT, 'site', url.slice(SITE.length + 1).replace(/^$/, 'index.html'));
      return [t, t + '.html', join(t, 'index.html')].some((c) => existsSync(c) && statSync(c).isFile());
    };
    const decoded = html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    let checked = 0;
    for (const p of providers) {
      assert.ok(html.includes(`id="${p.slug}"`), `${p.slug}: has a block`);
      const md = providerBadgeSnippetMarkdown(p, SITE);
      assert.ok(decoded.includes(md), `${p.slug}: Markdown snippet`);
      assert.ok(decoded.includes(providerBadgeSnippetHtml(p, SITE)), `${p.slug}: HTML snippet`);
      for (const [, url] of `${md} ${providerBadgeSnippetHtml(p, SITE)}`.matchAll(/(https:\/\/freellmapihub\.com[^\s)"]*)/g)) {
        assert.ok(local(url), `${p.slug}: ${url} resolves`);
        checked++;
      }
    }
    for (const [, url] of `${listedSnippetMarkdown(SITE)} ${listedSnippetHtml(SITE)}`.matchAll(/(https:\/\/freellmapihub\.com[^\s)"]*)/g)) { assert.ok(local(url), url); checked++; }
    assert.ok(checked >= providers.length * 5, `checked ${checked} snippet URLs`);
    // relative links and images of the page itself
    for (const [, href] of html.matchAll(/<(?:a|img)\s[^>]*?(?:href|src)="([^"#?]+)(?:[#?][^"]*)?"/g)) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) continue;
      const t = join(ROOT, 'site/badges', href);
      assert.ok([t, t + '.html', join(t, 'index.html')].some((c) => existsSync(c) && statSync(c).isFile()), `/badges/ -> ${href}`);
    }
    assert.doesNotMatch(html.split('<main')[1], /\bendorsed by\b|\bcertified by\b/i);
    assert.match(html, /not an endorsement/i);
    assert.match(html, /issues\/new\?template=inaccuracy\.yml/, 'how to request a correction');
  });

  test('every provider page links to its block, below the FAQ', () => {
    for (const p of providers) {
      const html = read(`site/p/${p.slug}.html`);
      const at = html.indexOf(`href="../badges/#${p.slug}">Get a badge</a>`);
      assert.ok(at > 0, `${p.slug}: Get a badge link`);
      const faq = html.indexOf('<h2 id="faq">');
      assert.ok(faq > 0 && at > faq, `${p.slug}: the link comes after the FAQ`);
    }
  });

  test('/badges/ is in the sitemap and in llms.txt', () => {
    assert.ok(read('site/sitemap.xml').includes(`<loc>${SITE}/badges/</loc>`));
    assert.ok(read('site/llms.txt').includes(`(${SITE}/badges/)`));
  });
});
