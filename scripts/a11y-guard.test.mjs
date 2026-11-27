// a11y-guard.test.mjs — keeps the issue classes found in the November 2026 accessibility pass from coming back.
//
// The Lighthouse gate (scripts/lighthouse-gate.mjs) runs axe on twenty-two pages, in one theme and one viewport, and
// only on the audits Lighthouse scores. These checks read EVERY built page instead, without a browser:
//   - one <main>, with the page's <h1> inside it (the home page once had its hero, h1 and filters outside every landmark);
//   - no two landmarks on a page share a name (two tables on /coding-tools/ were both "Comparison of the tools");
//   - the skip link points at an element that exists;
//   - the theme toggle has a name that does not fit both states, and site.js exposes the state with aria-pressed;
//   - plain links next to plain text (guide tables, compare speed lines, provider receipts) are underlined, not colour alone;
//   - the header menus keep keyboard focus on something visible (the Providers group on Escape, the phone menu on open).
// Run `npm run build` first: most pages under site/ are not committed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SITE = join(ROOT, 'site');

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

// Redirect stubs (a meta refresh to the real page) and third-party verification files are not pages a reader sees.
const pages = htmlFiles(SITE)
  .map((file) => ({ rel: relative(SITE, file), html: readFileSync(file, 'utf8') }))
  .filter((p) => !/<meta http-equiv="refresh"/i.test(p.html) && /<body[\s>]/.test(p.html));

/** The page body without comments, scripts and styles, so markup quoted in them is not counted. */
const body = (html) => html.slice(html.search(/<body[\s>]/))
  .replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<style\b[\s\S]*?<\/style>/g, '');

test('the built site is there to check (run npm run build first)', () => {
  assert.ok(existsSync(join(SITE, 'p')), 'site/p/ is missing: run `npm run build` before the tests');
  assert.ok(pages.length > 100, `only ${pages.length} pages found`);
});

test('every page has exactly one <main>, and its <h1> is inside it (WCAG 1.3.1; axe region / landmark-one-main)', () => {
  const bad = [];
  for (const { rel, html } of pages) {
    const b = body(html);
    const mains = b.match(/<main[\s>]/g) || [];
    if (mains.length !== 1) { bad.push(`${rel}: ${mains.length} <main> elements`); continue; }
    const start = b.search(/<main[\s>]/), end = b.indexOf('</main>');
    for (const m of b.matchAll(/<h1[\s>]/g)) if (m.index < start || m.index > end) bad.push(`${rel}: an <h1> outside <main>`);
  }
  assert.deepEqual(bad, []);
});

test('the home page: <main> runs from the hero to the explorer table, and nothing between the header and the footer is outside a landmark', () => {
  const b = body(readFileSync(join(SITE, 'index.html'), 'utf8'));
  const between = b.slice(b.indexOf('</header>') + '</header>'.length, b.indexOf('<footer')).trim();
  assert.match(between, /^<main id="main" class="home-main">/, 'the first thing after the header is <main>');
  assert.match(between, /<\/main>$/, 'the last thing before the footer is the end of <main>');
  for (const part of ['<section class="hero">', '<section class="first-use"', '<div class="controls">', '<table id="table"']) {
    assert.ok(between.includes(part), `${part} is inside <main>`);
  }
});

test('no two landmarks on a page share one name (axe landmark-unique)', () => {
  const LANDMARK = /<(nav|aside|section|div|form)\b([^>]*)>/g;
  const bad = [];
  for (const { rel, html } of pages) {
    const names = new Map();
    for (const [, tag, attrs] of body(html).matchAll(LANDMARK)) {
      const role = attrs.match(/\brole="([^"]+)"/)?.[1];
      const isLandmark = tag === 'nav' || tag === 'aside' || ['region', 'navigation', 'search', 'complementary'].includes(role) ||
        (tag === 'section' && /\baria-label(ledby)?=/.test(attrs));
      const label = attrs.match(/\baria-label="([^"]*)"/)?.[1];
      if (!isLandmark || !label) continue;
      const kind = `${role || tag}:${label}`;
      names.set(kind, (names.get(kind) || 0) + 1);
    }
    for (const [kind, n] of names) if (n > 1) bad.push(`${rel}: ${n} landmarks named ${kind}`);
  }
  assert.deepEqual(bad, []);
});

test('every skip link points at an element on its page (WCAG 2.4.1)', () => {
  const bad = [];
  for (const { rel, html } of pages) {
    const skip = html.match(/<a class="skip-link" href="#([^"]+)"/);
    if (!skip) { if (/<header class="site-header"/.test(html)) bad.push(`${rel}: no skip link`); continue; }
    if (!new RegExp(`\\bid="${skip[1]}"`).test(body(html))) bad.push(`${rel}: skip link to #${skip[1]}, which is not on the page`);
  }
  assert.deepEqual(bad, []);
});

test('the theme toggle is named for one state, and site.js says whether that state is on (WCAG 4.1.2)', () => {
  const bad = [];
  for (const { rel, html } of pages) {
    const btn = html.match(/<button[^>]*id="themeToggle"[^>]*>/)?.[0];
    if (btn && !/aria-label="Light theme"/.test(btn)) bad.push(`${rel}: ${btn.slice(0, 120)}`);
  }
  assert.deepEqual(bad, [], 'a name like "Toggle light and dark theme" fits both states, so "pressed" says nothing');
  const js = readFileSync(join(SITE, 'site.js'), 'utf8');
  assert.match(js, /toggle\.setAttribute\('aria-pressed', root\.getAttribute\('data-theme'\) === 'light' \? 'true' : 'false'\)/);
});

test('plain links next to plain text are underlined, not told apart by colour alone (WCAG 1.4.1; axe link-in-text-block)', () => {
  const css = readFileSync(join(SITE, 'styles.css'), 'utf8');
  const underlined = (selector) => {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[,}\\n]\\s*)${esc}\\s*[,{][^}]*?(?:\\{[^}]*)?text-decoration: underline`, 'm').test(css);
  };
  for (const selector of ['.table-scroll td > a:not([class])', '.compare-table td > div:not([class]) > a:not([class])', '.prov-receipt cite a', 'main p a:not([class])']) {
    assert.ok(underlined(selector), `styles.css underlines ${selector}`);
  }
  // The rules must still match what the build writes: a source link in a guide table, a speed line on a compare page.
  const guides = pages.filter((p) => p.rel.startsWith('guides/'));
  assert.ok(guides.some((p) => /<td>(?:(?!<\/td>).)*?<a href="https?:[^"]*"[^>]*>source/.test(p.html)), 'a guide table cell holds a plain "source" link');
  const compares = pages.filter((p) => p.rel.startsWith('compare/') && p.html.includes('class="compare-table"'));
  assert.ok(compares.some((p) => /<td><div><code>[^<]*<\/code>[^<]*<a href="https?:[^"]*"[^>]*>source/.test(p.html)), 'a compare page has a plain speed-line link');
});

// --- header menus, with a small fake DOM (as in mobile-nav.test.mjs) ---
const siteJs = readFileSync(join(SITE, 'site.js'), 'utf8');
function el(extra = {}) {
  const attrs = new Map();
  return {
    attrs, open: false, tagName: 'A', parent: null, children: [],
    setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'open') this.open = true; },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    removeAttribute(k) { attrs.delete(k); if (k === 'open') this.open = false; },
    addEventListener(type, fn) { (this.on ||= {})[type] = fn; },
    contains(x) { for (let n = x; n; n = n.parent) if (n === this) return true; return false; },
    classList: { set: new Set(), contains(c) { return this.set.has(c); }, add(c) { this.set.add(c); }, toggle(c, on) { if (on) this.set.add(c); else this.set.delete(c); } },
    ...extra,
  };
}
function menuFixture() {
  const doc = { listeners: {}, activeElement: null };
  const focus = function () { doc.activeElement = this; };
  const summary = el({ tagName: 'SUMMARY', focus });
  const groupLink = el({ focus });
  const group = el({ tagName: 'DETAILS', querySelector: (s) => (s === 'summary' ? summary : null) });
  summary.parent = group; groupLink.parent = group;
  const firstLink = el({ focus });
  const nav = el({ querySelector: (s) => (s === 'a, summary' ? firstLink : null) });
  group.parent = nav; firstLink.parent = nav;
  const toggle = el({ tagName: 'BUTTON', focus });
  const header = el();
  Object.assign(doc, {
    documentElement: el(),
    getElementById: (id) => ({ navToggle: toggle, 'primary-nav': nav }[id] || null),
    querySelector: (s) => (s === '.site-header' ? header : null),
    querySelectorAll: (s) => (s === '.nav-group' ? [group] : []),
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
  });
  runInNewContext(siteJs, { document: doc, window: {}, localStorage: { getItem() { return null; }, setItem() {} } });
  const key = (k) => doc.listeners.keydown.forEach((fn) => fn({ key: k, preventDefault() {} }));
  return { doc, toggle, firstLink, group, groupLink, summary, header, key };
}

test('the phone menu moves focus to its first link when it opens, and Escape brings it back to the toggle (WCAG 2.4.3)', () => {
  const f = menuFixture();
  f.toggle.on.click({ stopPropagation() {} });
  assert.equal(f.doc.activeElement, f.firstLink, 'the menu sits before the toggle in the page: focus must move into it');
  f.key('Escape');
  assert.equal(f.doc.activeElement, f.toggle);
});

test('Escape inside the Providers menu closes it and leaves focus on its summary, not on a hidden link (WCAG 2.4.3)', () => {
  const f = menuFixture();
  f.group.setAttribute('open', '');
  f.doc.activeElement = f.groupLink;
  f.key('Escape');
  assert.equal(f.group.open, false);
  assert.equal(f.doc.activeElement, f.summary);
});
