import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../site/site.js', import.meta.url), 'utf8');

function fixture({ missingToggle = false, missingNav = false, failListener = false } = {}) {
  const classes = new Set(), attrs = new Map(), events = {}, clicks = {};
  let focused = false;
  const header = { classList: {
    contains: (name) => classes.has(name),
    add: (name) => classes.add(name),
    toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
  } };
  const toggle = {
    setAttribute: (name, value) => attrs.set(name, value),
    addEventListener: (_type, fn) => { clicks.toggle = fn; },
    focus: () => { focused = true; },
  };
  const nav = { addEventListener: (_type, fn) => { clicks.nav = fn; } };
  const document = {
    documentElement: {},
    getElementById: (id) => id === 'navToggle' ? (missingToggle ? null : toggle) : id === 'primary-nav' ? (missingNav ? null : nav) : null,
    querySelector: (selector) => selector === '.site-header' ? header : null,
    querySelectorAll: () => [],
    addEventListener: (type, fn) => {
      if (failListener) throw new Error('listener setup failed');
      events[type] = fn;
    },
  };
  const start = () => runInNewContext(source, { document });
  return { start, classes, attrs, clicks, events, focused: () => focused };
}

test('mobile navigation remains visible in flow until its toggle is ready', () => {
  const css = readFileSync(new URL('../site/styles.css', import.meta.url), 'utf8');
  const start = css.indexOf('@media (max-width: 900px)');
  const mobile = css.slice(start, css.indexOf('@media (max-width: 720px)', start));
  assert.match(css, /\.nav-toggle \{ display: none; \}/);
  assert.match(mobile, /\.site-header\.nav-ready \.nav-toggle \{ display: inline-flex; \}/);
  assert.match(mobile, /\.site-header:not\(\.nav-ready\) \{ position: static; height: auto; \}/);
  assert.match(mobile, /\.site-header:not\(\.nav-ready\) \.header-inner \{[^}]*flex-wrap: wrap/);
  assert.match(mobile, /\.site-header:not\(\.nav-ready\) \.nav \{ display: flex; position: static; order: 3; flex-basis: 100%; \}/);
  for (const options of [{ missingToggle: true }, { missingNav: true }, { failListener: true }]) {
    const f = fixture(options);
    if (options.failListener) assert.throws(f.start, /listener setup failed/);
    else f.start();
    assert.equal(f.classes.has('nav-ready'), false, 'failed or incomplete setup leaves links accessible');
  }
});

test('enhanced navigation keeps toggle state, Escape focus and link/outside dismissal', () => {
  const f = fixture();
  f.start();
  assert.equal(f.classes.has('nav-ready'), true);
  const click = () => f.clicks.toggle({ stopPropagation() {} });
  click();
  assert.equal(f.classes.has('nav-open'), true);
  assert.equal(f.attrs.get('aria-expanded'), 'true');
  assert.equal(f.attrs.get('aria-label'), 'Close menu');
  click();
  assert.equal(f.classes.has('nav-open'), false);
  click();
  f.events.keydown({ key: 'Escape' });
  assert.equal(f.classes.has('nav-open'), false);
  assert.equal(f.attrs.get('aria-expanded'), 'false');
  assert.equal(f.attrs.get('aria-label'), 'Open menu');
  assert.equal(f.focused(), true);
  click();
  f.clicks.nav({ target: { closest: () => ({}) } });
  assert.equal(f.classes.has('nav-open'), false);
  click();
  f.events.click({ target: { closest: () => null } });
  assert.equal(f.classes.has('nav-open'), false);
});
