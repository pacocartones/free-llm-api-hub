import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { privateTree } from './lib/private-tree.mjs';
import { firstUseFacts, firstUseHtml } from './lib/home-first-use.mjs';
import { SLA_DAYS } from './lib/rules.mjs';

// The "New here?" strip on the home page: what the list is, what verified means, how to use it.
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

const P = [
  { slug: 'a', category: 'ongoing', verified: true, last_verified: '2026-03-10' },
  { slug: 'b', category: 'ongoing', verified: true, last_verified: '2026-01-02' },
  { slug: 'c', category: 'trial', verified: false, last_verified: null },
  { slug: 'd', category: 'trial', verified: true, last_verified: '2026-02-20' },
];

test('firstUseFacts: counts and the verification date range come from the records', () => {
  assert.deepEqual(firstUseFacts(P), {
    total: 4, ongoing: 2, trial: 2, verified: 3, unverified: 1,
    oldestVerified: '2026-01-02', newestVerified: '2026-03-10',
  });
  assert.deepEqual(firstUseFacts([]), { total: 0, ongoing: 0, trial: 0, verified: 0, unverified: 0, oldestVerified: null, newestVerified: null });
  // An unverified row's date never counts, even if one is set.
  assert.equal(firstUseFacts([{ verified: false, last_verified: '2020-01-01' }]).oldestVerified, null);
});

test('firstUseHtml: quotes the figures, dates the oldest verification and links the three references', () => {
  const html = firstUseHtml(P, { slaDays: 90 });
  assert.match(html, /<section class="first-use" aria-labelledby="first-use-h">/);
  assert.match(html, /<h2 id="first-use-h"[^>]*>New here\? How this dataset works<\/h2>/);
  for (const h of ['What this is', 'How we verify', 'How to use it']) assert.match(html, new RegExp(`<h3>.*${h}</h3>`));
  assert.match(html, /dataset of 4 free LLM/);
  assert.match(html, /2 ongoing free tiers and 2 trial credits/);
  assert.match(html, /3 of 4 entries are verified/);
  assert.match(html, /The dates run from <time datetime="2026-01-02">2026-01-02<\/time> to <time datetime="2026-03-10">2026-03-10<\/time>/);
  assert.match(html, /1 entry could not be confirmed from an official source and is marked/);
  assert.match(html, /Oldest verification: <time datetime="2026-01-02">2026-01-02<\/time>\. Each entry is due for a re-check 90 days after its date\./);
  for (const href of ['#explorer', 'methodology/', 'api/', 'changes/']) assert.ok(html.includes(`href="${href}"`), `links ${href}`);
});

test('firstUseHtml: no verified rows means no date claim at all', () => {
  const html = firstUseHtml([{ category: 'trial', verified: false }], { slaDays: 90 });
  assert.doesNotMatch(html, /<time|Oldest verification/);
  assert.match(html, /0 of 1 entries are verified/);
});

test('firstUseHtml: no marketing superlatives', () => {
  const text = firstUseHtml(P, { slaDays: 90 }).replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(text, /\b(best|fastest|ultimate|leading|most|trusted|guarantee[sd]?|always|never|100%|complete|comprehensive)\b/i);
});

let ROOT;
before(() => {
  ROOT = privateTree(REPO);
  execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' });
});

test('the built home page carries the strip from the real data, above the explorer controls', () => {
  const home = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  const { providers } = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  const block = home.match(/<!-- AUTOGEN:firstuse:start -->\n([\s\S]*?)\n<!-- AUTOGEN:firstuse:end -->/)?.[1];
  assert.ok(block, 'the home page has the first-use block');
  assert.equal(block, firstUseHtml(providers, { slaDays: SLA_DAYS }), 'the block is the module output for the committed data');
  const f = firstUseFacts(providers);
  assert.ok(f.oldestVerified, 'the dataset has verified rows');
  assert.ok(block.includes(`${f.verified} of ${f.total} entries are verified`));
  assert.ok(block.includes(`Oldest verification: <time datetime="${f.oldestVerified}">`));
  // Order: hero, then the strip, then the controls, then the explorer table.
  const at = (s) => home.indexOf(s);
  assert.ok(at('<section class="hero">') < at('<section class="first-use"'), 'the strip follows the hero');
  assert.ok(at('<section class="first-use"') < at('<div class="controls">'), 'the strip comes before the explorer controls');
  assert.ok(at('<div class="controls">') < at('<main id="explorer">'));
});

test('every link in the strip resolves in the build', () => {
  const home = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  const block = home.match(/<section class="first-use"[\s\S]*?<\/section>/)[0];
  const hrefs = [...block.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 4);
  for (const h of hrefs) {
    if (h.startsWith('#')) {
      assert.match(home, new RegExp(`id="${h.slice(1)}"`), `${h} is an anchor on the home page`);
      continue;
    }
    const file = h.endsWith('/') ? join(ROOT, 'site', h, 'index.html') : join(ROOT, 'site', h);
    assert.ok(existsSync(file), `${h} exists in the built site`);
  }
  // The icons it uses exist in the page's sprite.
  for (const m of block.matchAll(/<use href="#([\w-]+)"/g)) assert.match(home, new RegExp(`<symbol id="${m[1]}"`));
});
