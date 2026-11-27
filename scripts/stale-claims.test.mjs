// "What other sources get wrong" (data/stale-claims.json, lib/stale-claims.mjs): the stale claims are data, not prose;
// the build refuses an entry it cannot back with the provider's current value; the provider pages of Cerebras, Google
// Gemini, Groq and the providers whose stale figures third-party lists repeat show each claim next to the current value, with its quote or field, source and date.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { privateTree } from './lib/private-tree.mjs';
import { stripTags } from './lib/escape.mjs';
import { humanDate } from './lib/dates.mjs';
import { staleClaimErrors, staleClaimsFor, staleClaimsHtml, resolveEvidence, staleClaimsNoted, freeLimitsWords } from './lib/stale-claims.mjs';

const REPO = join(import.meta.dirname, '..');
const ROOT = privateTree(REPO);
before(() => { execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' }); });
const json = (rel) => JSON.parse(readFileSync(join(REPO, rel), 'utf8'));
const FILE = json('data/stale-claims.json');
const PROVIDERS = json('data/providers.json').providers;
const QUOTES = json('data/quotes.json').entries;
const ctx = { providers: PROVIDERS, quotes: QUOTES, today: '2999-12-31' };
const clone = (o) => JSON.parse(JSON.stringify(o));
const text = (html) => stripTags(html).replace(/\s+/g, ' ').replace(/&amp;/g, '&');
const pageOf = (slug) => readFileSync(join(ROOT, `site/p/${slug}.html`), 'utf8');

// The AEO baseline (assistant answers) and the third-party lists read on 27 Nov 2026.
const COVERED = ['cerebras', 'google-gemini', 'groq', 'openrouter', 'huggingface', 'nvidia-nim', 'jina-ai', 'cloudflare-workers-ai', 'fireworks-ai', 'assemblyai', 'deepgram'];

test('the file covers every provider a stale figure was found for, and passes its own guard', () => {
  assert.deepEqual(staleClaimErrors(FILE, ctx), []);
  for (const slug of COVERED) assert.ok(staleClaimsFor(FILE, slug).length >= 1, `${slug}: a claim`);
  assert.deepEqual([...new Set(FILE.claims.map((c) => c.slug))].sort(), [...COVERED].sort(), 'no provider without a claim found');
  // A claim taken from a third-party page cites that page; the assistant-answer claims cite the baseline instead.
  for (const c of FILE.claims.filter((x) => !/AEO baseline/.test(x.seen_in))) assert.match(c.seen_url || '', /^https:\/\//, `${c.slug}: the page it was seen on`);
  for (const c of FILE.claims) {
    assert.match(c.noted, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(c.claim && c.seen_in, `${c.slug}: claim and where it was seen`);
  }
});

test('staleClaimErrors: unknown provider, missing text, bad or future date, and evidence that does not resolve', () => {
  const base = { slug: 'groq', claim: 'x', seen_in: 'y', noted: '2026-11-27', evidence: [{ field: 'free_limits' }] };
  const one = (patch) => staleClaimErrors({ claims: [{ ...clone(base), ...patch }] }, { ...ctx, today: '2026-11-27' });
  assert.deepEqual(one({}), []);
  assert.match(one({ slug: 'no-such-provider' })[0], /not a provider/);
  assert.match(one({ claim: ' ' })[0], /claim must be/);
  assert.match(one({ seen_in: '' })[0], /seen_in must/);
  assert.match(one({ noted: '27 Nov' })[0], /noted must be YYYY-MM-DD/);
  assert.match(one({ noted: '2026-11-28' })[0], /after today/);
  assert.match(one({ evidence: [] })[0], /at least one/);
  assert.match(one({ evidence: [{ field: 'notes' }] })[0], /must be one of/);
  assert.match(one({ evidence: [{ quote: 'no.such.quote' }] })[0], /does not resolve/);
  assert.match(one({ evidence: [{ quote: 'cerebras.card_required.sentence' }] })[0], /does not resolve/, 'a quote of another provider');
  const unverified = PROVIDERS.find((p) => p.verified !== true);
  if (unverified) assert.ok(one({ slug: unverified.slug, evidence: [{ field: 'rate_limits' }] }).some((e) => /not verified/.test(e)));
  assert.deepEqual(staleClaimErrors({}, ctx), ['stale-claims.json: claims must be an array']);
  // A claim seen on a public page: an https URL, and the page's own date only with it, never after the day it was noted.
  assert.deepEqual(one({ seen_url: 'https://example.com/list', seen_date: '2026-05-01' }), []);
  assert.deepEqual(one({ seen_url: 'https://example.com/list' }), [], 'a page that states no date');
  assert.match(one({ seen_url: 'http://example.com/list' })[0], /seen_url must be an https URL/);
  assert.match(one({ seen_url: 'javascript:alert(1)' })[0], /seen_url must be an https URL/);
  assert.match(one({ seen_date: '2026-05-01' })[0], /needs seen_url/);
  assert.match(one({ seen_url: 'https://example.com/list', seen_date: 'May 2026' })[0], /seen_date must be YYYY-MM-DD/);
  assert.match(one({ seen_url: 'https://example.com/list', seen_date: '2026-11-28', noted: '2026-11-27' })[0], /after noted/);
});

test('staleClaimsHtml links the page a claim was seen on, with its date or "not stated"', () => {
  const groq = PROVIDERS.find((p) => p.slug === 'groq');
  const base = { slug: 'groq', claim: 'x', seen_in: 'A third-party list', noted: '2026-11-27', evidence: [{ field: 'free_limits' }] };
  const dated = staleClaimsHtml(groq, [{ ...base, seen_url: 'https://example.com/a?b=1&c=2', seen_date: '2026-05-01' }], { quotes: QUOTES });
  assert.ok(dated.includes('<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener nofollow">A third-party list</a>'));
  assert.ok(text(dated).includes('(page dated 1 May 2026); noted 27 Nov 2026'));
  const undated = staleClaimsHtml(groq, [{ ...base, seen_url: 'https://example.com/a' }], { quotes: QUOTES });
  assert.ok(text(undated).includes('(page date not stated)'));
  const plain = staleClaimsHtml(groq, [base], { quotes: QUOTES });
  assert.ok(!plain.includes('nofollow') && text(plain).includes('A third-party list; noted 27 Nov 2026'));
});

test('resolveEvidence reads the value from the data, never from the claims file', () => {
  const groq = PROVIDERS.find((p) => p.slug === 'groq');
  const fl = resolveEvidence({ field: 'free_limits' }, groq, QUOTES);
  assert.ok(fl.text.startsWith(freeLimitsWords(groq)));
  assert.equal(fl.date, groq.free_limits.checked);
  assert.equal(fl.source, groq.free_limits.source);
  const changed = { ...clone(groq), free_limits: { ...groq.free_limits, requests_per_day: 123456 } };
  assert.match(resolveEvidence({ field: 'free_limits' }, changed, QUOTES).text, /123,456 requests per day/, 'a re-verified figure flows through');
  const q = QUOTES.find((x) => x.id === 'cerebras.card_required.sentence');
  const cerebras = PROVIDERS.find((p) => p.slug === 'cerebras');
  assert.deepEqual(resolveEvidence({ quote: q.id }, cerebras, QUOTES), { label: 'In the provider’s words', text: q.text, quoted: true, source: q.source_url, date: q.read_on });
  assert.equal(staleClaimsHtml(cerebras, [], { quotes: QUOTES }), '', 'no claim, no block');
});

test('provider pages: a dated block with each stale claim next to the current value, its quote or field, source and date', () => {
  for (const slug of COVERED) {
    const p = PROVIDERS.find((x) => x.slug === slug);
    const claims = staleClaimsFor(FILE, slug);
    const html = pageOf(slug);
    const at = html.indexOf('<h2 id="other-sources">What other sources get wrong</h2>');
    assert.ok(at >= 0, `${slug}: the block`);
    const block = html.slice(at, html.indexOf('</table>', at));
    assert.ok(text(block).includes(`Noted ${humanDate(staleClaimsNoted(claims))}.`), `${slug}: dated`);
    for (const c of claims) {
      assert.ok(text(block).includes(`“${c.claim}”`), `${slug}: the claim from the file`);
      assert.ok(text(block).includes(`noted ${humanDate(c.noted)}`), `${slug}: the day it was noted`);
      if (c.seen_url) {
        assert.ok(block.includes(`href="${c.seen_url.replace(/&/g, '&amp;')}"`), `${slug}: the page the claim was seen on`);
        assert.ok(text(block).includes(c.seen_date ? `page dated ${humanDate(c.seen_date)}` : 'page date not stated'), `${slug}: that page's date`);
      }
      for (const ev of c.evidence) {
        const e = resolveEvidence(ev, p, QUOTES);
        assert.ok(text(block).includes(e.quoted ? `“${e.text}”` : e.text), `${slug}: the current value (${ev.quote || ev.field})`);
        assert.ok(text(block).includes(`Read ${humanDate(e.date)}`), `${slug}: its date`);
        assert.ok(block.includes(`href="${e.source.replace(/&/g, '&amp;')}"`), `${slug}: its source`);
      }
    }
  }
  // A provider with no claim has no block.
  assert.ok(!pageOf('mistral').includes('id="other-sources"'));
});

test('the build fails on a claim it cannot back', () => {
  const file = join(ROOT, 'data/stale-claims.json');
  const saved = readFileSync(file, 'utf8');
  try {
    const bad = clone(FILE);
    bad.claims[0].evidence = [{ quote: 'no.such.quote' }];
    writeFileSync(file, JSON.stringify(bad));
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /stale-claims\.json[\s\S]*does not resolve/);
  } finally {
    writeFileSync(file, saved);
  }
});
