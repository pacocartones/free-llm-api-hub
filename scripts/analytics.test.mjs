// Google Analytics behind a consent banner (lib/analytics.mjs, lib/consent.client.js). The build with no ID is covered in
// build.test.mjs (no analytics code anywhere); this file builds WITH an ID, in its own private tree, and runs the banner
// script against a small fake DOM to prove nothing from Google loads before Accept.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { privateTree } from './lib/private-tree.mjs';
import { measurementId, analyticsCspSources, consentScript, withAnalytics, FOOTER_SETTINGS } from './lib/analytics.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ID = 'G-TEST12345X';
const GA_HOSTS = ['https://www.googletagmanager.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com'];

describe('analytics config', () => {
  test('the ID comes from GA_MEASUREMENT_ID; empty means off; a malformed one stops the build', () => {
    assert.equal(measurementId({}), '');
    assert.equal(measurementId({ GA_MEASUREMENT_ID: '  ' }), '');
    assert.equal(measurementId({ GA_MEASUREMENT_ID: ` ${ID} ` }), ID);
    for (const bad of ['UA-1234-1', 'G-abc', 'G-12345"><script>', 'G-1234 5678']) {
      assert.throws(() => measurementId({ GA_MEASUREMENT_ID: bad }), /GA_MEASUREMENT_ID/, bad);
    }
  });

  test('without an ID nothing is added: no CSP host, no script, the page is unchanged', () => {
    assert.deepEqual(analyticsCspSources(''), { script: '', connect: '' });
    assert.equal(consentScript(''), null);
    const html = '<footer><p class="foot-legal"><a href="legal/privacy">Privacy</a></p></footer>\n</body>';
    assert.equal(withAnalytics(html, '', ''), html);
  });

  test('with an ID: the footer control and the deferred first-party script, with the page prefix', () => {
    const html = withAnalytics('<p class="foot-legal"><a href="../legal/privacy">Privacy</a> · <a href="../legal/terms">Terms</a></p>\n</body>', ID, '../');
    assert.ok(html.includes(`Terms</a>${FOOTER_SETTINGS}</p>`));
    assert.ok(html.includes('<script src="../consent.js" defer></script>\n</body>'));
    const js = consentScript(ID);
    assert.ok(js.includes(`'${ID}'`) && !js.includes('__GA_MEASUREMENT_ID__'));
  });
});

// ---------- the banner script, in a fake DOM ----------
function fakeDom({ stored = null, storageThrows = false } = {}) {
  const head = [], cookies = new Map([['_ga', '1'], ['_ga_ABC', '2'], ['theme', 'x']]);
  const store = new Map(stored ? [['analytics-consent', stored]] : []);
  let bannerClick = null, focused = null, inserted = null;
  const makeEl = (tag) => {
    const el = { tagName: tag, attrs: {}, hidden: false, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } };
    if (tag === 'section') {
      const buttons = { denied: null, granted: null };
      for (const v of Object.keys(buttons)) buttons[v] = { getAttribute: () => v, focus() { focused = this; }, closest() { return this; } };
      el.buttons = buttons;
      el.querySelector = () => buttons.denied;
      el.contains = (n) => n === buttons.denied || n === buttons.granted;
      el.addEventListener = (_t, fn) => { bannerClick = fn; };
    }
    return el;
  };
  const opener = { focus() { focused = this; } };
  const wrap = { hidden: true };
  opener.closest = () => wrap;
  let openerClick = null;
  opener.addEventListener = (_t, fn) => { openerClick = fn; };
  const document = {
    readyState: 'complete',
    head: { appendChild: (n) => head.push(n) },
    body: { insertBefore: (n) => { inserted = n; }, firstChild: null },
    createElement: makeEl,
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === '[data-consent-open]' ? [opener] : []),
    addEventListener: () => {},
    get activeElement() { return focused; },
    get cookie() { return [...cookies].map(([k, v]) => `${k}=${v}`).join('; '); },
    set cookie(s) { const [kv] = s.split(';'); const [k] = kv.split('='); if (/expires=Thu, 01 Jan 1970/.test(s)) cookies.delete(k.trim()); },
  };
  const localStorage = {
    getItem: (k) => { if (storageThrows) throw new Error('blocked'); return store.has(k) ? store.get(k) : null; },
    setItem: (k, v) => { if (storageThrows) throw new Error('blocked'); store.set(k, v); },
  };
  const window = {};
  const ctx = { window, document, localStorage, location: { hostname: 'freellmapihub.com' } };
  runInNewContext(consentScript(ID), ctx);
  const googleScripts = () => head.filter((n) => n.tagName === 'script' && /googletagmanager\.com\/gtag\/js/.test(n.src));
  const click = (v) => bannerClick({ target: inserted.buttons[v] });
  return { window, head, store, cookies, wrap, googleScripts, click, banner: () => inserted, openSettings: () => openerClick({ currentTarget: opener }), focused: () => focused, opener };
}

describe('consent banner behaviour', () => {
  test('first visit: the banner shows, nothing from Google loads, no gtag exists', () => {
    const d = fakeDom();
    assert.ok(d.banner(), 'banner inserted');
    assert.equal(d.banner().hidden, false);
    assert.equal(d.googleScripts().length, 0);
    assert.equal(d.window.gtag, undefined);
    assert.equal(d.window.dataLayer, undefined);
    assert.equal(d.wrap.hidden, false, 'the footer "Cookie settings" control is revealed');
  });

  test('Reject: no Google request, the choice is remembered, the banner hides', () => {
    const d = fakeDom();
    d.click('denied');
    assert.equal(d.googleScripts().length, 0);
    assert.equal(d.store.get('analytics-consent'), 'denied');
    assert.equal(d.banner().hidden, true);
    const again = fakeDom({ stored: 'denied' });
    assert.equal(again.banner(), null, 'a remembered Reject shows no banner');
    assert.equal(again.googleScripts().length, 0);
  });

  test('Accept: gtag.js loads with Consent Mode v2, analytics only, no ads signals', () => {
    const d = fakeDom();
    d.click('granted');
    assert.equal(d.store.get('analytics-consent'), 'granted');
    assert.equal(d.googleScripts().length, 1);
    assert.ok(d.googleScripts()[0].src.endsWith(`id=${ID}`));
    const calls = d.window.dataLayer.map((a) => Array.from(a));
    const consent = calls.find((c) => c[0] === 'consent' && c[1] === 'default');
    assert.deepEqual({ ...consent[2] }, { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    const config = calls.find((c) => c[0] === 'config');
    assert.equal(config[1], ID);
    assert.deepEqual({ ...config[2] }, { allow_google_signals: false, allow_ad_personalization_signals: false });
    assert.ok(calls.indexOf(consent) < calls.indexOf(config), 'consent defaults are set before config');
  });

  test('a remembered Accept loads analytics without showing the banner', () => {
    const d = fakeDom({ stored: 'granted' });
    assert.equal(d.banner(), null);
    assert.equal(d.googleScripts().length, 1);
  });

  test('Cookie settings reopens the banner with focus on it; Reject withdraws consent and deletes the GA cookies', () => {
    const d = fakeDom({ stored: 'granted' });
    d.openSettings();
    assert.equal(d.banner().hidden, false);
    assert.equal(d.focused(), d.banner().buttons.denied, 'focus moves into the banner');
    d.click('denied');
    assert.equal(d.window[`ga-disable-${ID}`], true);
    assert.ok(!d.cookies.has('_ga') && !d.cookies.has('_ga_ABC') && d.cookies.has('theme'), 'only the GA cookies are deleted');
    assert.equal(d.store.get('analytics-consent'), 'denied');
    assert.equal(d.focused(), d.opener, 'focus returns to the Cookie settings control');
  });

  test('blocked storage: the banner still works for the page and nothing loads before Accept', () => {
    const d = fakeDom({ storageThrows: true });
    assert.equal(d.googleScripts().length, 0);
    d.click('granted');
    assert.equal(d.googleScripts().length, 1);
  });
});

// ---------- a real build with an ID ----------
describe('build with GA_MEASUREMENT_ID set', () => {
  const ROOT = privateTree(REPO);
  const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
  before(() => execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, GA_MEASUREMENT_ID: ID } }));

  const PAGES = [['site/index.html', ''], ['site/p/groq.html', '../'], ['site/legal/privacy.html', '../'], ['site/compare/index.html', '../'], ['site/404.html', '/']];

  test('every page: GA hosts in the CSP, the banner script, the footer control, and no Google script in the HTML', () => {
    for (const [rel, prefix] of PAGES) {
      const html = read(rel);
      const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
      // Compare whole source tokens of each directive, not substrings of the policy.
      const sources = (dir) => csp.match(new RegExp(`${dir} ([^;]+)`))[1].trim().split(/\s+/);
      const script = new Set(sources('script-src'));
      const connect = new Set(sources('connect-src'));
      assert.ok(script.has('https://www.googletagmanager.com'), `${rel}: script-src allows gtag.js`);
      for (const h of GA_HOSTS) assert.ok(connect.has(h), `${rel}: connect-src allows ${h}`);
      assert.equal([...script].filter((s) => s.startsWith("'sha256-")).length, 2, `${rel}: the two inline hashes stay`);
      assert.ok(html.includes(`<script src="${prefix}consent.js" defer></script>`), `${rel}: consent.js with prefix ${prefix}`);
      assert.ok(html.includes('data-consent-open>Cookie settings</button>'), `${rel}: footer Cookie settings`);
      const body = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, '');
      assert.doesNotMatch(body, /googletagmanager|google-analytics|gtag\(/, `${rel}: nothing from Google is referenced in the HTML before consent`);
    }
  });

  test('site/consent.js is built with the ID', () => {
    assert.ok(existsSync(join(ROOT, 'site/consent.js')));
    assert.ok(read('site/consent.js').includes(`'${ID}'`));
  });

  test('the privacy page describes the opt-in analytics instead of "no cookies"', () => {
    const privacy = read('site/legal/privacy.html');
    assert.doesNotMatch(privacy, /sets no cookies/);
    assert.match(privacy, /Google Analytics <strong>only if you accept it<\/strong>/);
    assert.match(privacy, /processor/);
    assert.match(privacy, /kept for 2 months/);
    assert.match(privacy, /Cookie settings/);
    assert.match(privacy, /no request is ever sent to Google/);
  });
});
