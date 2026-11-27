// The answer-first verdict and the FAQ of the static compare pages (/compare/<a>-vs-<b>/): every fact is traceable to a
// field of data/providers.json, a null field reads "not stated" and never picks a side, the visible FAQ equals the
// FAQPage JSON-LD, and a page whose two records both lack free-tier data shows neither.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { compareVerdict, compareFaq, compareFaqHtml, hasFreeTierData, pickReasons, limitsEdge } from './lib/compare-faq.mjs';
import { comparePageJsonLd } from './lib/page-jsonld.mjs';
import { NOT_STATED } from './lib/not-stated.mjs';
import { privateTree } from './lib/private-tree.mjs';
import { escapeHtml } from './lib/html.mjs';

const ROOT = privateTree(join(import.meta.dirname, '..'));
before(() => { execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' }); });
const PROVIDERS = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data/providers.json'), 'utf8')).providers;
const BY_SLUG = Object.fromEntries(PROVIDERS.map((p) => [p.slug, p]));

const get = (p, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), p);
const jsonLd = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
// The published compare pages; the redirect stubs of retired pairs (data/redirects.json) live in the same folder.
const pages = () => readdirSync(join(ROOT, 'site/compare'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  .filter((name) => !readFileSync(join(ROOT, `site/compare/${name}/index.html`), 'utf8').includes('http-equiv="refresh"'));
const pairOf = (path) => {
  for (const p of PROVIDERS) {
    if (path.startsWith(`${p.slug}-vs-`) && BY_SLUG[path.slice(p.slug.length + 4)]) return [p, BY_SLUG[path.slice(p.slug.length + 4)]];
  }
  throw new Error(`no pair for ${path}`);
};

const blank = (slug, extra = {}) => ({
  slug, name: slug.toUpperCase(), category: null, free_type: null, free_tier: null, rate_limits: null, free_limits: null,
  card_required: null, phone_required: null, commercial_ok: null, openai_compatible: null, data_policy: null,
  verified: false, last_verified: null, ...extra,
});

test('every part of the verdict and the FAQ is traceable: the value in the part is the value in that side\'s record', () => {
  let n = 0;
  for (const path of pages()) {
    const [a, b] = pairOf(path);
    const v = compareVerdict(a, b);
    assert.ok(v, `${path}: has a verdict`);
    for (const part of [...v.parts, ...compareFaq(a, b).flatMap((it) => it.parts)]) {
      const rec = part.side === 'a' ? a : b;
      const actual = get(rec, part.field);
      assert.deepEqual(part.value, actual === undefined ? null : actual, `${path}: ${part.side}.${part.field}`);
      assert.ok(typeof part.text === 'string' && part.text.length, `${path}: ${part.field} has words`);
      if (part.value === null) assert.ok(part.text === NOT_STATED || part.text === 'not verified yet', `${path}: null ${part.field} reads not stated`);
      // The words of each fact appear in the text they belong to.
      if (part.field !== 'category') assert.ok(v.text.includes(part.text) || compareFaq(a, b).some((it) => it.a.includes(part.text)), `${path}: "${part.text}" is in the text`);
      n += 1;
    }
  }
  assert.ok(n > 100, 'checked the parts of every published page');
});

test('the verdict leads with each side\'s free offer, then who should pick which, then the flags and freshness', () => {
  // Fixed records, so the wording is pinned without depending on today's dataset.
  const a = blank('a', { name: 'Alpha', category: 'ongoing', free_limits: { requests_per_day: 500 }, card_required: false, phone_required: false,
    commercial_ok: true, openai_compatible: false, verified: true, last_verified: '2026-11-26' });
  const b = blank('b', { name: 'Beta', category: 'ongoing', free_limits: { requests_per_minute: 30, requests_per_day: 1000 }, card_required: false,
    openai_compatible: true, data_policy: { trains_on_prompts: false }, verified: true, last_verified: '2026-11-24' });
  const v = compareVerdict(a, b);
  assert.equal(v.text, 'For a free tier, Alpha gives an ongoing free tier (500 RPD), and Beta gives an ongoing free tier (30 RPM, 1,000 RPD). ' +
    'Pick Beta if you need the higher published limits (1,000 RPD against 500 RPD) or you want a drop-in OpenAI-compatible endpoint; on the recorded fields Alpha has no edge over it. ' +
    'Alpha / Beta: credit card not required for both; phone verification not required / not stated; commercial use allowed / not stated; ' +
    'trains on prompts not stated / no; OpenAI-compatible no / yes; last verified 26 Nov 2026 / 24 Nov 2026.');
  assert.ok(v.html.startsWith('<p class="answer-first">') && v.html.includes(escapeHtml(v.text)));
  // On the live data every verdict has the same three-part shape.
  for (const path of pages()) {
    const [x, y] = pairOf(path);
    assert.match(compareVerdict(x, y).text, /^For a free tier, .+ gives .+\. (Pick |The recorded fields).+ last verified .+\.$/, path);
  }
});

test('a side is picked only on two recorded, different values; a null never decides', () => {
  const a = blank('a', { category: 'ongoing', free_tier: 'Free', card_required: false, commercial_ok: null });
  const b = blank('b', { category: 'trial', free_tier: 'Credit', card_required: null, commercial_ok: false });
  const r = pickReasons(a, b);
  assert.deepEqual(r.a.map((x) => x.field), ['category'], 'card and commercial use are null on one side');
  assert.deepEqual(r.b, []);
  assert.match(compareVerdict(a, b).text, /Pick A if you want a free tier that does not run out; on the recorded fields B has no edge over it\./);
  const same = compareVerdict(blank('a', { free_tier: 'x' }), blank('b', { free_tier: 'y' })).text;
  assert.match(same, /do not separate them/);
  assert.match(same, /credit card not stated for both; phone verification not stated for both; commercial use not stated for both; trains on prompts not stated for both; OpenAI-compatible not stated for both; last verified not verified yet for both\./);
  assert.doesNotMatch(same, /not required|allowed|Pick /);
  // Limits in different units are never compared, and mixed directions decide nothing.
  assert.equal(limitsEdge(blank('a', { free_limits: { requests_per_day: 10 } }), blank('b', { free_limits: { requests_per_minute: 99 } })), null);
  assert.equal(limitsEdge(blank('a', { free_limits: { requests_per_day: 10, requests_per_minute: 5 } }), blank('b', { free_limits: { requests_per_day: 5, requests_per_minute: 10 } })), null);
});

test('no verdict and no FAQ when both sides lack free-tier data; one side with data is enough', () => {
  const a = blank('a'), b = blank('b');
  assert.equal(hasFreeTierData(a), false);
  assert.equal(compareVerdict(a, b), null);
  assert.deepEqual(compareFaq(a, b), []);
  assert.equal(compareFaqHtml(a, b), '');
  const graph = JSON.parse(comparePageJsonLd({ site: 'https://x', path: 'a-vs-b', a, b, faq: compareFaq(a, b) }))['@graph'];
  assert.equal(graph.some((n) => n['@type'] === 'FAQPage'), false);
  const one = compareVerdict(blank('a', { card_required: false }), b);
  assert.ok(one, 'one recorded flag is data');
  assert.match(one.text, /credit card not required \/ not stated/);
});

test('every compare page: the verdict is right under the H1, and the visible FAQ equals the FAQPage JSON-LD exactly', () => {
  for (const path of pages()) {
    const [a, b] = pairOf(path);
    const html = readFileSync(join(ROOT, `site/compare/${path}/index.html`), 'utf8');
    assert.match(html, /<h1>[^<]*<\/h1><p class="answer-first">/, `${path}: verdict right under the H1`);
    assert.ok(html.includes(compareVerdict(a, b).html), `${path}: the verdict built from the data`);
    const faqs = jsonLd(html)['@graph'].filter((n) => n['@type'] === 'FAQPage');
    assert.equal(faqs.length, 1, `${path}: one FAQPage node`);
    const entities = faqs[0].mainEntity;
    assert.ok(entities.length >= 3 && entities.length <= 4, `${path}: 3 to 4 questions`);
    const visible = [...html.matchAll(/<div class="faq-item" id="faq-[a-z]+"><h3>([^<]*)<\/h3><p>([^<]*)<\/p><\/div>/g)];
    assert.equal(visible.length, entities.length, `${path}: every question is visible`);
    entities.forEach((q, i) => {
      assert.equal(visible[i][1], escapeHtml(q.name), `${path}: question ${i + 1}`);
      assert.equal(visible[i][2], escapeHtml(q.acceptedAnswer.text), `${path}: answer ${i + 1}`);
      assert.match(q.acceptedAnswer.text, / Sources read: .+\.$/, `${path}: answer ${i + 1} cites its source dates`);
    });
  }
});

test('the verdict and the FAQ escape what comes from the data', () => {
  const evil = blank('a', { name: 'Acme <b>', free_tier: '<img src=x onerror=1>', commercial_ok: 'conditional', commercial_ok_condition: '<script>x</script>' });
  const html = compareVerdict(evil, blank('b', { free_tier: 'x' })).html + compareFaqHtml(evil, blank('b', { free_tier: 'x' }));
  const lower = html.toLowerCase();
  assert.ok(!lower.includes('<script') && !lower.includes('<b>') && !lower.includes('<img'), 'no markup from the data survives');
});
