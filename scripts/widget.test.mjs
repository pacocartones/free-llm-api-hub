import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../site/widget.js', import.meta.url), 'utf8');

function render(providers, attributes = {}, fetchImpl = async () => ({ ok: true, json: async () => ({ providers }) })) {
  return new Promise((resolve, reject) => {
    const element = {
      getAttribute: (name) => attributes[name] ?? null,
      set innerHTML(value) { resolve(value); },
    };
    try {
      runInNewContext(source, {
        document: { getElementById: () => element },
        window: {
          FLLM_RULES: { recScore: () => 0 },
          FLLM_SORT: { comparator: (_key, _direction, a, b) => a.name.localeCompare(b.name) },
        },
        fetch: fetchImpl,
      });
    } catch (error) { reject(error); }
  });
}

test('widget counts all verified providers, excluding false and unknown statuses before display filters', { timeout: 1000 }, async () => {
  const html = await render([
    { slug: 'alpha', name: 'Alpha', verified: true, modalities: ['text'] },
    { slug: 'beta', name: 'Beta', verified: true, modalities: ['audio'] },
    { slug: 'unverified', name: 'Unverified', verified: false, modalities: ['text'] },
    { slug: 'unknown', name: 'Unknown', modalities: ['text'] },
  ], { 'data-modality': 'text', 'data-count': '1' });
  assert.match(html, /1 of 2 verified · see all/);
  assert.match(html, /\/p\/alpha"/);
  for (const slug of ['beta', 'unverified', 'unknown']) assert.ok(!html.includes('/p/' + slug + '"'));
});

test('widget reports zero verified when no provider is verified', { timeout: 1000 }, async () => {
  const html = await render([{ slug: 'unverified', verified: false }, { slug: 'unknown', verified: null }]);
  assert.match(html, /0 of 0 verified · see all/);
  assert.doesNotMatch(html, /\/p\//);
});

test('widget keeps its load-error message for network, HTTP and invalid data failures', { timeout: 1000 }, async () => {
  for (const fetchImpl of [
    async () => { throw new Error('offline'); },
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => ({}) }),
  ]) {
    const html = await render([], {}, fetchImpl);
    assert.match(html, /Could not load the Free LLM API Hub widget\./);
    assert.doesNotMatch(html, /verified · see all/);
  }
});

test('widget box style stays one well-formed attribute: no double quote inside it (the font stack quotes Segoe UI with single quotes)', { timeout: 1000 }, async () => {
  const html = await render([{ slug: 'alpha', name: 'Alpha', verified: true, modalities: ['text'] }]);
  const m = html.match(/^<div style="([^"]*)">/);
  assert.ok(m, 'the outer div opens with a quoted style attribute');
  const style = m[1];
  assert.match(style, /^font:14px\/1\.5 /);
  assert.ok(style.includes("'Segoe UI'"), 'Segoe UI is quoted with single quotes');
  assert.ok(style.endsWith('box-sizing:border-box'), 'the attribute holds every declaration, up to the last one');
  for (const decl of ['color:#fbf1ec', 'background:#211915', 'border-radius:10px', 'max-width:440px']) assert.ok(style.includes(decl), decl);
  // Every style attribute the widget writes is closed by the same quote character it opens with.
  for (const attr of html.match(/style="[^"]*"/g)) assert.doesNotMatch(attr.slice(7, -1), /["<>]/, attr);
});

// The widget inlines its colours (it runs on other sites), so nothing ties them to the palette: the Cálida rework
// left the old crimson accent on the old green panel (3.3:1). Pin them to the dark tokens of styles.css :root.
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('widget colours are the dark palette tokens of styles.css, and every text colour is >= 4.5:1 on its panel', { timeout: 1000 }, async () => {
  const css = readFileSync(new URL('../site/styles.css', import.meta.url), 'utf8');
  const rootBlock = css.match(/^:root \{([\s\S]*?)^\}/m)[1];
  const token = (name) => rootBlock.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))[1].toLowerCase();
  const palette = new Set(['panel', 'text', 'muted', 'accent', 'border', 'border-strong'].map(token));
  const html = await render([{ slug: 'alpha', name: 'Alpha', verified: true, free_tier: 'Free', modalities: ['text'] }]);
  const used = [...html.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0].toLowerCase());
  assert.ok(used.length > 0);
  for (const hex of used) assert.ok(palette.has(hex), `${hex} is not one of the dark palette tokens`);
  const panel = html.match(/background:(#[0-9a-f]{6})/i)[1];
  assert.equal(panel, token('panel'));
  for (const [, fg] of html.matchAll(/[;"]color:(#[0-9a-f]{6})/gi)) assert.ok(contrast(fg, panel) >= 4.5, `${fg} on ${panel}: ${contrast(fg, panel).toFixed(2)}:1`);
});
