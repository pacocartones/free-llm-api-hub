import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { claimsTableHtml, claimsFilters } from './lib/claims-table.mjs';
import { privateTree } from './lib/private-tree.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const claim = (stated) => ({ state: stated ? 'stated' : 'not-stated', quotes: [] });
const LABELS = { a: 'Point A', b: 'Point B', c: 'Point C' };
const entry = (slug, kind, a, b, c) => ({ slug, name: `Name ${slug}`, kind, claims: { a: claim(a), b: claim(b), c: claim(c) } });
const ENTRIES = [entry('one', 'x', true, true, false), entry('two', 'y', true, false, false), entry('three', 'x', true, false, false)];
const kindLabel = (k) => `kind ${k}`;

test('claimsFilters: only a point that tells the services apart is a filter; kinds need two or more', () => {
  const f = claimsFilters(ENTRIES, LABELS);
  assert.deepEqual(f.fields, ['b'], 'A is stated by all and C by none: neither filters anything');
  assert.deepEqual(f.kinds.sort(), ['x', 'y']);
  assert.deepEqual(claimsFilters([entry('s', 'x', true, true, true), entry('t', 'x', true, true, true)], LABELS), { fields: [], kinds: [] });
});

test('claimsTableHtml: one row per service, every cell says Stated or Not stated, every row links to its entry', () => {
  const html = claimsTableHtml({ id: 'z', entries: ENTRIES, labels: LABELS, kindLabel, subject: 'service' });
  assert.equal((html.match(/<tr data-kind=/g) || []).length, 3);
  assert.equal((html.match(/<th scope="col">/g) || []).length, 2 + 2, 'service, kind and a column per point that some service states (C is stated by none)');
  assert.match(html, /No service states: point c\. That is <strong>Not stated<\/strong>/);
  for (const e of ENTRIES) {
    const row = html.match(new RegExp(`<tr data-kind="${e.kind}" data-stated="([^"]*)"><th scope="row"><a href="#${e.slug}">`));
    assert.ok(row, `${e.slug} has a row that links to #${e.slug}`);
    assert.equal(row[1], ['a', 'b', 'c'].filter((f) => e.claims[f].state === 'stated').join(' '), 'the stated points, recomputed');
  }
  const body = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));   // the cells, not the sentences around them
  assert.equal((body.match(/>Stated</g) || []).length, 4);
  assert.equal((body.match(/>Not stated</g) || []).length, 2);
  // a Stated cell links to its sentence; a Not stated cell links to nothing
  assert.match(body, /<td class="s"><a href="#one-a">Stated<\/a><\/td>/);
  assert.ok(!/<td class="n"><a/.test(body), 'Not stated has nothing to link to');
  assert.equal((body.match(/<td class="s"><a href="#/g) || []).length, 4, 'every Stated cell is a link');
  assert.equal((body.match(/<td class="n">Not stated<\/td>/g) || []).length, 2, 'only the points that someone states are columns');
  // keyboard and screen readers: every checkbox and radio sits inside its label
  const inputs = html.match(/<input [^>]*>/g) || [];
  assert.ok(inputs.length >= 3);
  assert.equal((html.match(/<label><input /g) || []).length, inputs.length, 'every input is inside a label');
  assert.ok(!html.includes('<script'), 'no script');
  assert.ok(!/<(svg|img)/.test(html), 'text only: no icon stands for a state');
  assert.match(html, /<caption class="sr-only">/);
  assert.match(html, /<input type="checkbox" name="z-state" value="b">/);
  assert.match(html, /<input type="radio" name="z-kind" value="" checked>/);
});

test('claimsTableHtml: nothing is drawn for fewer than two services, and no filter box when nothing filters', () => {
  assert.equal(claimsTableHtml({ id: 'z', entries: ENTRIES.slice(0, 1), labels: LABELS, kindLabel, subject: 'service' }), '');
  const flat = [entry('s', 'x', true, true, true), entry('t', 'x', true, true, true)];
  assert.ok(!claimsTableHtml({ id: 'z', entries: flat, labels: LABELS, kindLabel, subject: 'service' }).includes('<fieldset'));
});

test('the built pages: the table matches the data, tables.css is loaded only by these two pages and covers every filter value', () => {
  const ROOT = privateTree(REPO);
  execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' });
  const css = readFileSync(join(ROOT, 'site/tables.css'), 'utf8');
  const loaders = [];
  const walk = (dir) => readdirSync(dir).flatMap((n) => { const f = join(dir, n); return statSync(f).isDirectory() ? (n === 'node_modules' ? [] : walk(f)) : (f.endsWith('.html') ? [f] : []); });
  for (const f of walk(join(ROOT, 'site'))) if (readFileSync(f, 'utf8').includes('href="../tables.css"')) loaders.push(f.slice(join(ROOT, 'site').length + 1));
  assert.deepEqual(loaders.sort(), ['coding-tools/index.html', 'free-gpu/index.html']);
  for (const [page, file, id] of [['free-gpu', 'data/gpu-compute.json', 'gpu'], ['coding-tools', 'data/coding-tools.json', 'tools']]) {
    const data = JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
    const html = readFileSync(join(ROOT, `site/${page}/index.html`), 'utf8');
    const table = html.slice(html.indexOf(`id="${id}-glance"`), html.indexOf('</table>', html.indexOf(`id="${id}-glance"`)));
    assert.equal((table.match(/<tr data-kind=/g) || []).length, data.entries.length, `${page}: one row per entry`);
    for (const e of data.entries) {
      assert.ok(html.includes(`<section class="gpu-entry" id="${e.slug}">`), `${page}: the entry ${e.slug} that the row links to exists`);
      const row = table.match(new RegExp(`<tr data-kind="${e.kind}" data-stated="([^"]*)"><th scope="row"><a href="#${e.slug}">`));
      assert.ok(row, `${page}: ${e.slug} has its row`);
      assert.equal(row[1], Object.keys(e.claims).filter((f) => e.claims[f].state === 'stated').join(' '));
    }
  }
  // every Stated cell of the built pages leads to a claim block that holds the sentence itself
  for (const page of ['free-gpu', 'coding-tools']) {
    const html = readFileSync(join(ROOT, `site/${page}/index.html`), 'utf8');
    let links = 0;
    for (const m of html.matchAll(/<td class="s"><a href="#([^"]+)"/g)) {
      links += 1;
      const at = html.indexOf(`<div class="gpu-claim" id="${m[1]}">`);
      assert.ok(at > 0, `${page}: the claim ${m[1]} exists`);
      const block = html.slice(at, html.indexOf('</div>', html.indexOf('</dd>', at)));
      assert.match(block, /<blockquote class="gpu-quote">/, `${page}: the claim ${m[1]} shows its sentence`);
    }
    assert.ok(links > 0, `${page}: some value is stated`);
    assert.equal((html.match(/id="[a-z0-9_-]+-[a-z_]+"/g) || []).length >= links, true);
    // the focus ring is never taken away from the filters, and without :has() nothing is hidden
    assert.doesNotMatch(css, /outline:\s*(none|0)/);
  }
  // every point and kind that a filter can carry has its rule, so a new value cannot be a dead checkbox
  const fields = new Set(); const kinds = new Set();
  for (const file of ['data/gpu-compute.json', 'data/coding-tools.json', 'data/coding-tools-own-key.json']) {
    for (const e of JSON.parse(readFileSync(join(ROOT, file), 'utf8')).entries) { kinds.add(e.kind); Object.keys(e.claims).forEach((f) => fields.add(f)); }
  }
  for (const f of fields) assert.ok(css.includes(`[name$=-state][value=${f}]:checked) tbody tr:not([data-stated~=${f}])`), `tables.css has the rule of the point ${f}`);
  for (const k of kinds) assert.ok(css.includes(`[name$=-kind][value=${k}]:checked) tbody tr:not([data-kind=${k}])`), `tables.css has the rule of the kind ${k}`);
  assert.ok(!/:checked\) tr:not/.test(css), 'every filter rule is scoped to tbody, so a filter never hides the header row');
  assert.ok(css.length < 4096, `tables.css stays small (${css.length} bytes)`);
  assert.doesNotMatch(css, /@import|url\(/, 'no request from the sheet');
});
