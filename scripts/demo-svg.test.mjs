// demo-svg: the README's terminal demo (assets/demo.svg) uses the Cálida palette of site/styles.css, not a palette
// of its own. It is a standalone image (GitHub shows it through <img>), so it cannot read the CSS variables; it copies
// their values instead, and this test keeps the copies honest. The QA pass of November 2026 found it still on the
// pre-brand green (docs/qa/post-brand-2026-11.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../site/styles.css', import.meta.url), 'utf8');
const SVG = readFileSync(new URL('../assets/demo.svg', import.meta.url), 'utf8');

const tokens = (block) => new Map([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map(([, name, hex]) => [name, hex.toLowerCase()]));
const DARK = tokens(CSS.match(/^:root \{([\s\S]*?)^\}/m)[1]);
const LIGHT = tokens(CSS.match(/^\[data-theme="light"\] \{([\s\S]*?)^\}/m)[1]);

const style = SVG.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
const lightMedia = style.match(/@media \(prefers-color-scheme: light\) \{([\s\S]*?)\n {4}\}/);
const darkCss = style.replace(lightMedia ? lightMedia[0] : '', '');
/** class name -> { fill, stroke } from the simple `.a, .b { fill: #x; }` rules of a style sheet. */
const classColours = (css) => {
  const out = new Map();
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const name of sel.split(',').map((s) => s.trim()).filter((s) => /^\.[\w-]+$/.test(s))) {
      const entry = out.get(name.slice(1)) || {};
      for (const [, prop, hex] of body.matchAll(/(fill|stroke):\s*(#[0-9a-f]{6})/gi)) entry[prop] = hex.toLowerCase();
      out.set(name.slice(1), entry);
    }
  }
  return out;
};
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('demo.svg sets its colours in its style sheet only, never on a shape', () => {
  const markup = SVG.replace(/<style>[\s\S]*?<\/style>/, '');
  assert.doesNotMatch(markup, /#[0-9a-f]{3,8}\b/i, 'a colour written on an element escapes the light-theme swap');
});

test('demo.svg uses the dark Cálida tokens by default and the light ones on a light system', () => {
  assert.ok(lightMedia, 'demo.svg has a prefers-color-scheme: light block');
  const dark = new Set(DARK.values());
  const light = new Set(LIGHT.values());
  const darkUsed = [...darkCss.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0].toLowerCase());
  const lightUsed = [...lightMedia[1].matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0].toLowerCase());
  assert.ok(darkUsed.length >= 5 && lightUsed.length >= 5);
  for (const hex of darkUsed) assert.ok(dark.has(hex), `${hex} is not a token of styles.css :root`);
  for (const hex of lightUsed) assert.ok(light.has(hex), `${hex} is not a token of styles.css [data-theme="light"]`);
  // The pre-brand green, by name, so a revert names what came back.
  for (const old of ['#3fce8f', '#0a0d0b', '#0d110f', '#1d2a22', '#2a3a30', '#d8e2dc', '#8a998f', '#5b6a61']) assert.ok(!SVG.toLowerCase().includes(old), `old green ${old} is back`);
  // The accent is the brand accent in each theme.
  assert.equal(classColours(darkCss).get('accent').fill, DARK.get('accent'));
  assert.equal(classColours(lightMedia[1]).get('accent').fill, LIGHT.get('accent'));
});

test('every text colour of demo.svg is >= 4.5:1 on the terminal window and its title bar, in both themes', () => {
  for (const [label, css] of [['dark', darkCss], ['light', `${darkCss}\n${lightMedia[1]}`]]) {
    const colours = classColours(css);
    for (const ground of [colours.get('win').fill, colours.get('bar').fill]) {
      for (const cls of ['fg', 'accent', 'muted', 'dim', 'caret']) {
        const fg = colours.get(cls).fill;
        assert.ok(contrast(fg, ground) >= 4.5, `${label}: .${cls} ${fg} on ${ground} is ${contrast(fg, ground).toFixed(2)}:1`);
      }
    }
  }
});
