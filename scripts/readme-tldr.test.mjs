// The README's TL;DR table is authored by hand, so nothing regenerates it when the data changes.
// These tests tie each row back to data/providers.json: every linked provider must exist and be
// verified, every number a row quotes must appear in the facts of the providers it links, and the
// flags a row claims (no card, no phone, commercial use, OpenAI-compatible, permanently free) must
// match the dataset. When a provider changes, this fails and points at the row to rewrite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shortenProse } from './lib/short-text.mjs';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const { providers } = JSON.parse(readFileSync(new URL('../data/providers.json', import.meta.url), 'utf8'));
const bySlug = new Map(providers.map((p) => [p.slug, p]));

const tldrRows = () => {
  const start = readme.indexOf('## TL;DR');
  assert.ok(start >= 0, 'README has a TL;DR section');
  const section = readme.slice(start, readme.indexOf('\n## ', start + 5));
  return section.split('\n').filter((l) => l.startsWith('| **')).map((line) => {
    const [want, pick, why] = line.split(' | ').map((c) => c.replace(/^\| /, '').replace(/ \|$/, ''));
    return { line, want, pick, why, slugs: [...line.matchAll(/freellmapihub\.com\/p\/([a-z0-9-]+)/g)].map((m) => m[1]) };
  });
};

// Numbers as the data writes them: "10k" means 10,000; "$10" and "10" are the same figure.
const numbers = (text) => [...String(text).matchAll(/\$?(\d[\d,]*(?:\.\d+)?)\s*([kKM])?\b/g)].map(([, n, unit]) => {
  const v = Number(n.replace(/,/g, ''));
  return unit === 'k' || unit === 'K' ? v * 1000 : unit === 'M' ? v * 1_000_000 : v;
});
const factText = (p) => [p.free_tier, p.rate_limits, p.notes, p.expires].filter(Boolean).join(' ');

test('every TL;DR row links only verified providers that exist in the dataset', () => {
  const rows = tldrRows();
  assert.ok(rows.length >= 10, `expected the TL;DR table, found ${rows.length} rows`);
  for (const { want, slugs } of rows) {
    assert.ok(slugs.length, `${want}: row links no provider page`);
    for (const slug of slugs) {
      assert.ok(bySlug.has(slug), `${want}: /p/${slug} is not in data/providers.json`);
      assert.equal(bySlug.get(slug).verified, true, `${want}: ${slug} is not verified`);
    }
  }
});

test('every number a TL;DR row quotes appears in the facts of the providers it links', () => {
  for (const { want, pick, why, slugs } of tldrRows()) {
    const known = new Set(slugs.flatMap((s) => numbers(factText(bySlug.get(s)))));
    // Strip the link targets so URL digits are not read as claims.
    const claimed = numbers(`${pick} ${why}`.replace(/\]\([^)]*\)/g, ']'));
    for (const n of claimed) assert.ok(known.has(n), `${want}: "${n}" is not in the dataset facts of ${slugs.join(', ')}; update the README row`);
  }
});

const row = (label) => {
  const r = tldrRows().find((x) => x.want.includes(label));
  assert.ok(r, `TL;DR row "${label}" exists`);
  return r;
};
const named = (...slugs) => slugs.map((s) => { assert.ok(bySlug.has(s), `${s} in dataset`); return bySlug.get(s); });

test('TL;DR flag claims match the dataset', () => {
  for (const p of named(...row('No card *and* no phone').slugs)) {
    assert.equal(p.card_required, false, `${p.slug} is listed as no card`);
    assert.equal(p.phone_required, false, `${p.slug} is listed as no phone`);
  }
  // "Groq, SiliconFlow and NVIDIA all gate signup behind phone verification"
  for (const p of named('groq', 'siliconflow', 'nvidia-nim')) assert.equal(p.phone_required, true, `${p.slug} is named as phone-gated`);
  for (const p of named(...row('Permanently free').slugs)) assert.equal(p.free_type, 'perpetual', `${p.slug} is listed as permanently free`);
  for (const p of named(...row('OpenAI-compatible endpoint').slugs)) assert.equal(p.openai_compatible, true, `${p.slug} is listed as OpenAI-compatible`);
  for (const p of named(...row('safe to ship commercially').slugs)) assert.equal(p.commercial_ok, true, `${p.slug} is listed as commercial OK`);
  // "the way Cohere and NVIDIA do" (restrict the free tier to evaluation)
  for (const p of named('cohere', 'nvidia-nim')) assert.equal(p.commercial_ok, false, `${p.slug} is named as evaluation-only`);
});

test('shortenProse keeps whole sentences and never drops text silently', () => {
  assert.deepEqual(shortenProse('Short.', 50), { text: 'Short.', shortened: false });
  const long = 'First sentence is here. Second sentence is longer than the limit allows for sure.';
  assert.deepEqual(shortenProse(long, 40), { text: 'First sentence is here.', shortened: true });
  const one = 'one very long sentence without any full stop that keeps going and going';
  const cut = shortenProse(one, 30);
  assert.equal(cut.shortened, true);
  assert.ok(cut.text.endsWith('…') && cut.text.length <= 30, cut.text);
  assert.ok(one.startsWith(cut.text.slice(0, -1)), 'the cut is a prefix');
});

test('the README top table shortens long catches and links the full text', () => {
  const start = readme.indexOf('<!-- AUTOGEN:best:start -->');
  const table = readme.slice(start, readme.indexOf('<!-- AUTOGEN:best:end -->'));
  for (const line of table.split('\n').filter((l) => /^\| \d+ \|/.test(l))) {
    const cells = line.split(' | ');
    const catchCell = cells[4].replace(/ \[More ↗\]\([^)]*\)$/, '');
    assert.ok(catchCell.length <= 260, `catch cell too long (${catchCell.length}): ${catchCell.slice(0, 60)}…`);
  }
});
