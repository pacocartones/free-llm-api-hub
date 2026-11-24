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
const GA_HOSTS = ['https://www.googletagmanager.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.g.doubleclick.net', 'https://*.google.com'];

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
const KEY = 'cookie-consent';
const VERSION = 1;
const saved = (analytics, ads, v = VERSION) => JSON.stringify({ v, analytics, ads, at: '2026-11-24' });
const ALL_COOKIES = [['_ga', '1'], ['_ga_ABC', '2'], ['_gcl_au', '3'], ['_gac_x', '4'], ['theme', 'x']];

function fakeDom({ stored = null, storageThrows = false } = {}) {
  const head = [], cookies = new Map(ALL_COOKIES);
  const store = new Map(stored ? [[KEY, stored]] : []);
  let bannerClick = null, focused = null, inserted = null;
  const node = (attrs) => ({
    attrs: { ...attrs }, hidden: false,
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
    focus() { focused = this; }, closest() { return this; },
  });
  const makeEl = (tag) => {
    const el = node({});
    el.tagName = tag;
    if (tag === 'section') {
      const sw = {};
      for (const k of ['analytics', 'ads']) {
        sw[k] = node({ 'data-cat': k, role: 'switch', 'aria-checked': 'false' });
        const state = { textContent: 'Off' };
        sw[k].querySelector = () => state;
        sw[k].state = state;
      }
      const action = (a) => node({ 'data-action': a });
      const main = { reject: action('reject'), customize: action('customize'), accept: action('accept') };
      const custom = { reject: action('reject'), save: action('save'), accept: action('accept') };
      const views = [node({ 'data-view': 'custom' }), node({ 'data-view': 'main' }), node({ 'data-view': 'custom' })];
      views[0].hidden = true;
      views[2].hidden = true;
      Object.assign(el, { sw, main, custom, views });
      el.querySelectorAll = (sel) => (sel === '[data-cat]' ? [sw.analytics, sw.ads] : sel === '[data-view]' ? views : []);
      el.querySelector = (sel) => (sel === '[data-view="main"] [data-action]' ? main.reject : null);
      const inside = new Set([sw.analytics, sw.ads, ...Object.values(main), ...Object.values(custom)]);
      el.contains = (n) => inside.has(n);
      el.addEventListener = (_t, fn) => { bannerClick = fn; };
    }
    return el;
  };
  const opener = node({});
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
  runInNewContext(consentScript(ID), { window, document, localStorage, location: { hostname: 'freellmapihub.com' } });
  const b = () => inserted;
  const visible = () => b().views.filter((v) => !v.hidden).map((v) => v.attrs['data-view']);
  return {
    window, head, store, cookies, wrap, opener, banner: b, visible,
    googleScripts: () => head.filter((n) => n.tagName === 'script' && /googletagmanager\.com\/gtag\/js/.test(n.src)),
    calls: () => (window.dataLayer || []).map((a) => Array.from(a)),
    choice: () => JSON.parse(store.get(KEY)),
    press: (view, a) => bannerClick({ target: b()[view][a] }),
    toggle: (k) => bannerClick({ target: b().sw[k] }),
    openSettings: () => openerClick({ currentTarget: opener }),
    focused: () => focused,
  };
}
const plain = (o) => JSON.parse(JSON.stringify(o));
const consentOf = (a, d) => ({ analytics_storage: a ? 'granted' : 'denied', ad_storage: d ? 'granted' : 'denied', ad_user_data: d ? 'granted' : 'denied', ad_personalization: d ? 'granted' : 'denied' });

describe('consent banner behaviour', () => {
  test('first visit: three equal actions, nothing from Google, no gtag, Cookie settings revealed', () => {
    const d = fakeDom();
    assert.equal(d.banner().hidden, false);
    assert.deepEqual(d.visible(), ['main']);
    assert.equal(d.googleScripts().length, 0);
    assert.equal(d.window.gtag, undefined);
    assert.equal(d.window.dataLayer, undefined);
    assert.equal(d.wrap.hidden, false);
  });

  test('the banner source: same button style for every action, switches with role and aria-checked, both off', () => {
    const src = consentScript(ID);
    const actions = [...src.matchAll(/<button type="button" class="([^"]+)" data-action="(\w+)"/g)];
    assert.deepEqual(actions.map((m) => m[2]), ['reject', 'customize', 'accept', 'reject', 'save', 'accept']);
    assert.ok(actions.every((m) => m[1] === 'btn ghost'), 'every action has the same style');
    assert.match(src, /role="switch" aria-checked="false" data-cat="' \+ key/);
    assert.match(src, /aria-labelledby="consent-' \+ key \+ '-name"/);
  });

  // Each combination, through Customize, the switches and Save.
  for (const [a, ads] of [[false, false], [true, false], [false, true], [true, true]]) {
    test(`Customize: analytics ${a ? 'on' : 'off'}, advertising ${ads ? 'on' : 'off'}`, () => {
      const d = fakeDom();
      d.press('main', 'customize');
      assert.deepEqual(d.visible(), ['custom', 'custom']);
      assert.equal(d.focused(), d.banner().sw.analytics, 'focus moves to the first switch');
      assert.equal(d.banner().sw.analytics.getAttribute('aria-checked'), 'false');
      assert.equal(d.banner().sw.ads.getAttribute('aria-checked'), 'false');
      if (a) d.toggle('analytics');
      if (ads) d.toggle('ads');
      assert.equal(d.banner().sw.ads.state.textContent, ads ? 'On' : 'Off', 'the state is shown in text too');
      d.press('custom', 'save');
      assert.equal(d.choice().v, VERSION);
      assert.equal(d.choice().analytics, a);
      assert.equal(d.choice().ads, ads);
      assert.equal(d.banner().hidden, true);
      if (!a && !ads) {
        assert.equal(d.googleScripts().length, 0, 'nothing loads with both off');
        assert.equal(d.window.gtag, undefined);
        assert.equal(d.window[`ga-disable-${ID}`], true);
        return;
      }
      assert.equal(d.googleScripts().length, 1);
      assert.ok(d.googleScripts()[0].src.endsWith(`id=${ID}`));
      const calls = d.calls();
      const iDefault = calls.findIndex((c) => c[0] === 'consent' && c[1] === 'default');
      const iUpdate = calls.findIndex((c) => c[0] === 'consent' && c[1] === 'update');
      const iConfig = calls.findIndex((c) => c[0] === 'config');
      assert.ok(iDefault === 0 && iDefault < iUpdate && iUpdate < iConfig, 'default denied, then update, then config');
      assert.deepEqual(plain(calls[iDefault][2]), consentOf(false, false));
      assert.deepEqual(plain(calls[iUpdate][2]), consentOf(a, ads));
      assert.deepEqual(plain(calls[iConfig][2]), { allow_google_signals: ads, allow_ad_personalization_signals: ads });
      assert.equal(calls.find((c) => c[0] === 'set' && c[1] === 'ads_data_redaction')[2], !ads);
      assert.equal(calls.find((c) => c[0] === 'set' && c[1] === 'url_passthrough')[2], false);
      assert.equal(d.window[`ga-disable-${ID}`], false);
      // the cookies of a category left off are deleted
      assert.equal(d.cookies.has('_ga'), a);
      assert.equal(d.cookies.has('_gcl_au'), ads);
      assert.ok(d.cookies.has('theme'));
    });
  }

  test('Accept all grants both; Reject all grants none and sends nothing', () => {
    const acc = fakeDom();
    acc.press('main', 'accept');
    assert.deepEqual([acc.choice().analytics, acc.choice().ads], [true, true]);
    assert.deepEqual(plain(acc.calls().find((c) => c[1] === 'update')[2]), consentOf(true, true));
    const rej = fakeDom();
    rej.press('main', 'reject');
    assert.deepEqual([rej.choice().analytics, rej.choice().ads], [false, false]);
    assert.equal(rej.googleScripts().length, 0);
    assert.equal(rej.window.dataLayer, undefined);
  });

  test('a remembered choice applies without the banner; an older consent version or an old-format value asks again', () => {
    const d = fakeDom({ stored: saved(true, false) });
    assert.equal(d.banner(), null);
    assert.equal(d.googleScripts().length, 1);
    const none = fakeDom({ stored: saved(false, false) });
    assert.equal(none.banner(), null);
    assert.equal(none.googleScripts().length, 0);
    for (const stale of [saved(true, true, VERSION - 1), 'granted', '{broken']) {
      const s = fakeDom({ stored: stale });
      assert.ok(s.banner() && s.banner().hidden === false, `re-asks for ${stale}`);
      assert.equal(s.googleScripts().length, 0, `nothing loads for ${stale}`);
    }
  });

  test('Cookie settings reopens the switches with the current state and returns focus afterwards', () => {
    const d = fakeDom({ stored: saved(true, true) });
    d.openSettings();
    assert.equal(d.banner().hidden, false);
    assert.deepEqual(d.visible(), ['custom', 'custom']);
    assert.equal(d.banner().sw.analytics.getAttribute('aria-checked'), 'true');
    assert.equal(d.banner().sw.ads.getAttribute('aria-checked'), 'true');
    assert.equal(d.focused(), d.banner().sw.analytics);
    d.press('custom', 'save');
    assert.equal(d.focused(), d.opener);
  });

  test('withdrawing advertising only: consent and signals updated to denied, ads cookies deleted, analytics kept', () => {
    const d = fakeDom({ stored: saved(true, true) });
    d.openSettings();
    d.toggle('ads');
    d.press('custom', 'save');
    const calls = d.calls();
    const last = calls.filter((c) => c[0] === 'consent' && c[1] === 'update').pop();
    assert.deepEqual(plain(last[2]), consentOf(true, false));
    const set = calls.filter((c) => c[0] === 'set' && typeof c[1] === 'object').pop();
    assert.deepEqual(plain(set[1]), { allow_google_signals: false, allow_ad_personalization_signals: false, ads_data_redaction: true, url_passthrough: false });
    assert.ok(!d.cookies.has('_gcl_au') && !d.cookies.has('_gac_x'));
    assert.ok(d.cookies.has('_ga') && d.cookies.has('_ga_ABC'));
    assert.equal(d.window[`ga-disable-${ID}`], false);
  });

  test('withdrawing everything: all denied, every Google cookie deleted, ga-disable set', () => {
    const d = fakeDom({ stored: saved(true, true) });
    d.openSettings();
    d.press('custom', 'reject');
    assert.deepEqual(plain(d.calls().filter((c) => c[1] === 'update').pop()[2]), consentOf(false, false));
    for (const c of ['_ga', '_ga_ABC', '_gcl_au', '_gac_x']) assert.ok(!d.cookies.has(c), `${c} deleted`);
    assert.ok(d.cookies.has('theme'));
    assert.equal(d.window[`ga-disable-${ID}`], true);
  });

  test('blocked storage: the banner still works for the page and nothing loads before a choice', () => {
    const d = fakeDom({ storageThrows: true });
    assert.equal(d.googleScripts().length, 0);
    d.press('main', 'accept');
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
      // nothing beyond the site's own sources and the GA4 / Google signals hosts
      assert.deepEqual([...connect].sort(), ["'self'", 'https://raw.githubusercontent.com', ...GA_HOSTS].sort(), `${rel}: connect-src scope`);
      assert.deepEqual([...script].filter((s) => !s.startsWith("'sha256-")).sort(), ["'self'", 'https://www.googletagmanager.com'].sort(), `${rel}: script-src scope`);
      assert.equal([...script].filter((s) => s.startsWith("'sha256-")).length, 2, `${rel}: the two inline hashes stay`);
      const consentTag = html.match(/<script src="([^"]*)consent\.js\?v=[0-9a-f]{8}" defer><\/script>/);
      assert.ok(consentTag && consentTag[1] === prefix, `${rel}: consent.js (fingerprinted) with prefix ${prefix}`);
      assert.ok(html.includes('data-consent-open>Cookie settings</button>'), `${rel}: footer Cookie settings`);
      const body = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, '');
      assert.doesNotMatch(body, /googletagmanager|google-analytics|gtag\(/, `${rel}: nothing from Google is referenced in the HTML before consent`);
    }
  });

  test('site/consent.js is built with the ID', () => {
    assert.ok(existsSync(join(ROOT, 'site/consent.js')));
    assert.ok(read('site/consent.js').includes(`'${ID}'`));
  });

  test('the privacy page describes both categories instead of "no cookies"', () => {
    const privacy = read('site/legal/privacy.html');
    assert.doesNotMatch(privacy, /sets no cookies/);
    assert.match(privacy, /<strong>only for the categories you allow<\/strong>/);
    assert.match(privacy, /<h3>1\. Analytics<\/h3>/);
    assert.match(privacy, /<h3>2\. Advertising &amp; personalised measurement \(Google signals\)<\/h3>/);
    assert.match(privacy, /signed in and have turned on ad personalisation/);
    assert.match(privacy, /demographics/);
    assert.match(privacy, /across devices/);
    assert.match(privacy, /independent controller/);
    assert.match(privacy, /processor/);
    assert.match(privacy, /EU–US Data Privacy Framework/);
    assert.match(privacy, /kept in Google Analytics for 14 months/);
    assert.match(privacy, /what you type in its search box \(cut to 60 characters/);
    assert.match(privacy, /Cookie settings/);
    assert.match(privacy, /GDPR Art\. 6\(1\)\(a\)/);
    assert.match(privacy, /no request is ever sent to Google/);
  });
});
