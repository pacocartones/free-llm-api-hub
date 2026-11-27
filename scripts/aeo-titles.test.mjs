// Citable titles (AEO baseline, 27 Nov 2026: 0 of 26 assistant answers cited the site; the pages that were cited repeat the
// question literally and carry a count and a date). The OpenAI-compatible guide and the commercial-use collection state
// their count and date in the <title> and the h1, from the data; the JSON-LD names agree with the visible text; every
// count is phrased the way lib/figures.mjs allows. The highest-limits guide is pinned in long-guides.test.mjs and the
// home title in home-seo.test.mjs.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { privateTree } from './lib/private-tree.mjs';
import { stripTags } from './lib/escape.mjs';
import { humanDate } from './lib/dates.mjs';
import { datasetAsOf } from './lib/release-stamp.mjs';
import { figureErrors, providerFigures } from './lib/figures.mjs';

const ROOT = privateTree(join(import.meta.dirname, '..'));
before(() => { execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' }); });
const DATA = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data/providers.json'), 'utf8'));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const unescape = (s) => s.split('&amp;').join('&');
const titleOf = (html) => unescape(html.match(/<title>([^<]*)<\/title>/)[1]);
const h1Of = (html) => unescape(stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]).trim());
const graphOf = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
const figs = () => providerFigures(DATA.providers);

test('OpenAI-compatible guide: "OpenAI-compatible free LLM APIs (N, checked <date>): base URLs", with every base URL in the table', () => {
  const html = read('site/guides/openai-compatible-free-apis.html');
  const list = DATA.providers.filter((p) => p.verified === true && p.openai_compatible === true);
  const want = `OpenAI-compatible free LLM APIs (${list.length}, checked ${humanDate(datasetAsOf(DATA))}): base URLs`;
  assert.equal(titleOf(html), want, 'the <title> carries the count and the check date, with no second month appended');
  assert.equal(h1Of(html), want);
  assert.deepEqual(figureErrors(want, figs(), 'title'), []);
  const graph = graphOf(html);
  assert.equal(graph.find((n) => n['@type'] === 'Article').headline, want, 'the JSON-LD headline is the h1');
  assert.equal(graph.find((n) => n['@type'] === 'BreadcrumbList').itemListElement[2].name, want);
  // The table: one row per provider, with its openai_base_url, or "not stated" when the record has none.
  assert.match(html, /<th[^>]*>Base URL \(<code>openai_base_url<\/code>\)<\/th>/);
  for (const p of list) {
    const at = html.indexOf(`<td class="name"><a href="../p/${p.slug}">`);
    assert.ok(at >= 0, `${p.slug}: a row`);
    const row = html.slice(at, html.indexOf('</tr>', at));
    const cell = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)][1][1];
    if (p.openai_base_url) assert.equal(unescape(stripTags(cell)), p.openai_base_url, `${p.slug}: base URL`);
    else assert.equal(stripTags(cell), 'not stated', `${p.slug}: no base URL recorded`);
  }
  const answer = stripTags(html.match(/<p class="answer">([\s\S]*?)<\/p>/)[1]);
  assert.ok(answer.startsWith(`${list.length} verified free APIs`), answer);
  assert.ok(answer.includes(`the table lists the base URL of ${list.filter((p) => p.openai_base_url).length}.`), answer);
  // llms.txt lists the guide under the same h1.
  assert.ok(read('site/llms.txt').includes(`[${want}](`), 'llms.txt uses the filled h1');
});

test('commercial-use collection: "Free LLM API for commercial use: what each provider’s terms allow (N checked)"', () => {
  const html = read('site/collections/commercial-use.html');
  const rows = DATA.providers.filter((p) => p.verified === true && p.commercial_ok === true);
  const want = `Free LLM API for commercial use: what each provider’s terms allow (${rows.length} checked)`;
  assert.equal(titleOf(html), want);
  assert.equal(h1Of(html), want);
  assert.deepEqual(figureErrors(want, figs(), 'title'), []);
  const list = graphOf(html).find((n) => n['@type'] === 'ItemList');
  assert.equal(list.name, want, 'the ItemList is named by the h1');
  assert.equal(list.numberOfItems, rows.length, 'and counts the same rows');
  assert.ok(read('collections/commercial-use.md').includes(`# ${want}\n`), 'the repo markdown has the same heading');
  // The short name stays on the chips of the other collections.
  assert.ok(read('site/collections/no-phone.html').includes('>Free LLM APIs for commercial use</a>'));
});

test('home: the <title> holds the literal phrase "free LLM API list", the dataset month and the counts', () => {
  const t = titleOf(read('site/index.html'));
  assert.match(t, /free LLM API list/i);
  assert.ok(t.length < 60, t);
  assert.deepEqual(figureErrors(t, figs(), 'home title'), []);
});
