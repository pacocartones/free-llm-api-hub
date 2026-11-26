// The answer-first paragraph and the FAQ of provider pages (/p/<slug>), phase 2 of the SEO/AEO plan: every answer comes
// from a field of data/providers.json, a null field reads "not stated" and nothing else, every answer cites the day its
// source was read, and the visible FAQ matches the FAQPage JSON-LD. Also the home <title>, which leads with "Free LLM APIs".
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { answerFirst, providerFaq, providerFaqHtml, providerFaqJsonLd, flagWords, NOT_STATED } from './lib/provider-faq.mjs';
import { shortDate } from './lib/provider-meta.mjs';
import { privateTree } from './lib/private-tree.mjs';
import { escapeHtml } from './lib/html.mjs';

const ROOT = privateTree(join(import.meta.dirname, '..'));
before(() => { execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' }); });
const PROVIDERS = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data/providers.json'), 'utf8')).providers;

const get = (p, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), p);
// The page writes "<" in its JSON-LD as \u003c, which JSON.parse reads back as it is: no unescaping by hand.
const jsonLd = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

const nulls = {
  slug: 'blank', name: 'Blank', category: 'trial', free_type: 'trial-credit', free_tier: 'Some credit', rate_limits: null,
  expires: null, card_required: null, phone_required: null, commercial_ok: null, openai_compatible: null, openai_base_url: null,
  docs_url: 'https://example.com/docs', verified: true, last_verified: '2026-11-20',
};

test('every part of every answer is traceable to its field: the value in the part is the value in the record', () => {
  for (const p of PROVIDERS) {
    for (const part of [...answerFirst(p).parts, ...providerFaq(p).flatMap((it) => it.parts)]) {
      const actual = get(p, part.field);
      assert.deepEqual(part.value, actual === undefined ? null : actual, `${p.slug}: ${part.field}`);
      assert.ok(typeof part.text === 'string' && part.text.length, `${p.slug}: ${part.field} has words`);
    }
  }
});

test('a null field is answered with "not stated" and nothing else, in the parts and in the text', () => {
  for (const p of [...PROVIDERS, nulls]) {
    const items = providerFaq(p);
    for (const part of [...answerFirst(p).parts, ...items.flatMap((it) => it.parts)]) {
      if (part.value === null) assert.equal(part.text, NOT_STATED, `${p.slug}: ${part.field} is null`);
    }
  }
  const af = answerFirst(nulls).text;
  assert.match(af, /Credit card: not stated; phone verification: not stated; commercial use: not stated\./);
  assert.doesNotMatch(af, /not required|allowed|required;/);
  const byId = Object.fromEntries(providerFaq(nulls).map((it) => [it.id, it.a]));
  assert.equal(byId['faq-limits'], 'Not stated. Source read 20 Nov 2026.');
  assert.equal(byId['faq-card'], 'Credit card: not stated. Phone verification: not stated. Source read 20 Nov 2026.');
  assert.equal(byId['faq-commercial'], 'Commercial use: not stated. Source read 20 Nov 2026.');
  assert.equal(byId['faq-data'], 'Not stated. Source read 20 Nov 2026.');
  assert.equal(byId['faq-openai'], 'Not stated. Source read 20 Nov 2026.');
  for (const v of [null, undefined, 'weird']) assert.equal(flagWords('card_required', v), NOT_STATED);
});

test('the answer-first paragraph: ongoing free tier or trial credit, the headline limits, card, phone and commercial use', () => {
  const groq = PROVIDERS.find((p) => p.slug === 'groq');
  const t = answerFirst(groq).text;
  assert.match(t, /^Yes\. Groq has an ongoing free tier/);
  assert.match(t, /30 RPM, 1,000 RPD, 200K TPD/, 'the published numbers lead');
  const trial = { ...nulls, card_required: true, commercial_ok: 'conditional', expires: '30 days' };
  assert.match(answerFirst(trial).text, /^Not permanently\. Blank gives a one-time trial credit, not an ongoing free tier: Some credit; the credit expires after 30 days\. Credit card: required; phone verification: not stated; commercial use: allowed with conditions\. Verified 20 Nov 2026\.$/);
  assert.match(answerFirst({ ...nulls, verified: false }).text, /Not verified yet\.$/);
  // Our own words are two sentences after the verdict word, plus the verification day; the headline is the record's.
  for (const p of PROVIDERS) {
    const af = answerFirst(p);
    const head = af.parts.find((x) => x.field === 'free_limits' || x.field === 'free_tier').text;
    const ours = af.text.replace(head, 'HEADLINE').replace(/^(Yes|Not permanently)\. /, '');
    const sentences = ours.split(/(?<=[.…])\s+(?=[A-Z])/);
    assert.ok(sentences.length <= 3, `${p.slug}: ${sentences.length} sentences in ${ours}`);
  }
});

test('every FAQ answer cites the day its source was read, and that day is a date of the record', () => {
  for (const p of PROVIDERS) {
    const items = providerFaq(p);
    assert.ok(items.length >= 4 && items.length <= 6, `${p.slug}: 4 to 6 questions`);
    assert.deepEqual(items.map((it) => it.id), ['faq-free', 'faq-limits', 'faq-card', 'faq-commercial', 'faq-data', 'faq-openai']);
    const recordDates = new Set(JSON.stringify(p).match(/\d{4}-\d{2}-\d{2}/g) || []);
    for (const it of items) {
      if (it.date) {
        assert.ok(recordDates.has(it.date), `${p.slug} ${it.id}: ${it.date} is in the record`);
        assert.ok(it.a.endsWith(` Source read ${shortDate(it.date)}.`), `${p.slug} ${it.id}: ends with its source date`);
      } else {
        assert.ok(it.a.endsWith(' Source date not recorded.'), `${p.slug} ${it.id}: says the date is missing`);
      }
    }
  }
});

test('provider page: the answer is the first thing after the H1, and the visible FAQ equals the FAQPage JSON-LD', () => {
  for (const slug of ['groq', 'cerebras', 'google-gemini', 'poolside']) {
    const p = PROVIDERS.find((x) => x.slug === slug);
    const html = readFileSync(join(ROOT, `site/p/${slug}.html`), 'utf8');
    assert.match(html, /<h1>[^<]*<\/h1><p class="answer-first">/, `${slug}: answer right under the H1`);
    assert.ok(html.includes(answerFirst(p).html), `${slug}: the paragraph is the one built from the data`);
    const graph = jsonLd(html)['@graph'];
    const faqs = graph.filter((n) => n['@type'] === 'FAQPage');
    assert.equal(faqs.length, 1, `${slug}: one FAQPage node`);
    const faq = faqs[0];
    assert.ok(faq.mainEntity.length >= 4 && faq.mainEntity.length <= 6);
    const visible = [...html.matchAll(/<div class="faq-item" id="faq-[a-z]+"><h3>([^<]*)<\/h3><p>([\s\S]*?)<\/p><\/div>/g)];
    assert.equal(visible.length, faq.mainEntity.length, `${slug}: every question is visible`);
    // The visible markup is compared in its escaped form: the question, then the answer up to its source date, then the
    // date as a <time> element. Nothing is stripped or unescaped, so the comparison cannot hide a difference.
    faq.mainEntity.forEach((q, i) => {
      assert.equal(q['@type'], 'Question');
      assert.equal(q.acceptedAnswer['@type'], 'Answer');
      assert.ok(q.name && q.acceptedAnswer.text, 'name and answer text');
      assert.equal(visible[i][1], escapeHtml(q.name), `${slug}: question ${i + 1} matches`);
      const text = q.acceptedAnswer.text;
      const cut = text.lastIndexOf(' Source ');
      const body = escapeHtml(text.slice(0, cut));
      const item = providerFaq(p)[i];
      const tail = item.date ? ` <span class="muted">Source read <time datetime="${item.date}">${shortDate(item.date)}</time>` : ' <span class="muted">Source date not recorded';
      assert.ok(visible[i][2].startsWith(body + tail), `${slug}: answer ${i + 1} matches`);
      assert.equal(text.slice(cut), item.date ? ` Source read ${shortDate(item.date)}.` : ' Source date not recorded.');
    });
    assert.deepEqual(faq, JSON.parse(JSON.stringify(providerFaqJsonLd(p))));
  }
});

test('the FAQ escapes what comes from the data', () => {
  const evil = { ...nulls, name: 'Acme <b>', commercial_ok: 'conditional', commercial_ok_condition: '<script>x</script>' };
  const html = providerFaqHtml(evil);
  const lower = html.toLowerCase();
  assert.ok(!lower.includes('<script') && !lower.includes('<b>'), 'no markup from the data survives, in any letter case');
  assert.match(html, /Acme &lt;b&gt; FAQ/);
});

test('the home <title> leads with "Free LLM APIs" and stays under 60 characters', () => {
  const html = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  const title = html.match(/<title>([^<]*)<\/title>/)[1].split('&amp;').join('&');
  assert.ok(title.startsWith('Free LLM APIs'), title);
  assert.ok(title.length < 60, `${title.length} characters: ${title}`);
});
