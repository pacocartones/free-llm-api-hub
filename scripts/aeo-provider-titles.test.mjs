// Question-shaped provider titles (AEO baseline, recommendation 1). A provider page is titled by the question a developer
// asks, its answer word, the short catch and the newest day a fact was read (lib/provider-title.mjs). The <title>, the
// h1, the meta description's first clause, the answer-first sentence, the JSON-LD WebPage name, the first FAQPage
// question, the Markdown twin and llms.txt all carry the same words. The guide titles are pinned in aeo-titles.test.mjs.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { privateTree } from './lib/private-tree.mjs';
import { stripTags } from './lib/escape.mjs';
import { providerTitle, freeVerdict, trialCredit, TITLE_MAX } from './lib/provider-title.mjs';
import { providerDateModified } from './lib/provider-dates.mjs';
import { answerFirst, providerFaq } from './lib/provider-faq.mjs';
import { mdText } from './lib/provider-markdown.mjs';

const ROOT = privateTree(join(import.meta.dirname, '..'));
before(() => { execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' }); });
const PROVIDERS = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data/providers.json'), 'utf8')).providers;
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').split('&amp;').join('&');
const titleOf = (html) => unescape(html.match(/<title>([^<]*)<\/title>/)[1]);
const h1Of = (html) => unescape(stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]).trim());
const descOf = (html) => unescape(html.match(/<meta name="description" content="([^"]*)">/)[1]);
const graphOf = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];

const base = {
  slug: 'acme', name: 'Acme', verified: true, last_verified: '2026-11-20', free_tier: 'Some free access',
  card_required: null, phone_required: null, commercial_ok: null, openai_compatible: null, docs_url: 'https://acme.example/docs',
};

test('ongoing: "Is the <name> API free? Yes: <limits>, <card> (checked <newest date>)"', () => {
  const p = {
    ...base, category: 'ongoing', free_type: 'renewing-quota', card_required: false,
    free_limits: { requests_per_minute: 30, requests_per_day: 1000, source: 'https://acme.example/limits', checked: '2026-11-22' },
    field_checks: { card_required: { status: 'stated', checked: '2026-11-26', sources: ['https://acme.example/card'] } },
  };
  const t = providerTitle(p);
  assert.equal(t.question, 'Is the Acme API free?');
  assert.equal(t.verdict, 'Yes');
  assert.equal(t.date, '2026-11-26', 'the newest field check, not last_verified');
  // The figures are cut from the end until the title fits: both would make 75 characters.
  assert.equal(t.title, 'Is the Acme API free? Yes: 30 RPM, no card (checked 2026-11-26)');
  assert.equal(providerTitle(p, { max: 80 }).title, 'Is the Acme API free? Yes: 30 RPM, 1,000 RPD, no card (checked 2026-11-26)');
  assert.ok(answerFirst(p).text.startsWith(`${t.verdict}. `), 'the first sentence answers with the same word');
  assert.equal(providerFaq(p)[0].q, t.question, 'the first FAQ question is the title question');
  // Without published figures, the catch names the kind of free access.
  assert.equal(providerTitle({ ...p, free_limits: null }, { max: 80 }).title, 'Is the Acme API free? Yes: quota renews, no card (checked 2026-11-26)');
});

test('trial credit: "Does <name> have a free API? No: $N trial, <card> (checked <date>)"', () => {
  const p = { ...base, category: 'trial', free_type: 'trial-credit', card_required: true, free_tier: '$5 in free credits for new accounts', expires: '30 days' };
  assert.equal(trialCredit(p), '$5');
  const t = providerTitle(p);
  assert.equal(t.question, 'Does Acme have a free API?');
  assert.equal(t.verdict, 'No');
  assert.equal(t.title, 'Does Acme have a free API? No: $5 trial (checked 2026-11-20)', 'the card is dropped first to stay under the limit');
  assert.equal(providerTitle(p, { max: 80 }).title, 'Does Acme have a free API? No: $5 trial, card required (checked 2026-11-20)');
  assert.ok(answerFirst(p).text.startsWith('No. Acme gives a one-time trial credit'), answerFirst(p).text);
  // A credit that is not stated as an amount at the start of free_tier is never guessed.
  assert.equal(trialCredit({ free_tier: '$100 promotional credits for sandbox usage' }), null);
  assert.equal(providerTitle({ ...p, name: 'Ax', free_tier: 'Credits for testing', card_required: null }).title, 'Does Ax have a free API? No: trial credit (checked 2026-11-20)');
  assert.equal(freeVerdict({ category: undefined }), 'Not stated', 'an unknown category is "not stated", never "no"');
});

test(`a long name: the catch goes first, then the short question, then a trailing "(…)"; under ${TITLE_MAX} characters when anything fits`, () => {
  const long = { ...base, category: 'ongoing', free_type: 'perpetual', card_required: false, name: 'Acme Inference Platform (express mode)' };
  const t = providerTitle(long);
  assert.ok(t.title.length <= TITLE_MAX, t.title);
  assert.equal(t.title, 'Is the Acme Inference Platform API free? Yes (checked 2026-11-20)');
  assert.equal(providerTitle({ ...base, category: 'ongoing', name: 'Acme API (Studio)' }).question, 'Is Acme API (Studio) free?', 'no "the … API API"');
  // Nothing fits: the shortest candidate, still a question with its answer and date.
  const huge = providerTitle({ ...long, name: 'Acme Extraordinarily Long Enterprise Generative Inference Platform' });
  assert.equal(huge.title, 'Is Acme Extraordinarily Long Enterprise Generative Inference Platform free? Yes (checked 2026-11-20)');
});

test('a not-stated date reads "check date not stated", never the build day', () => {
  const p = { ...base, category: 'ongoing', free_type: 'perpetual', verified: false, last_verified: null };
  assert.equal(providerDateModified(p), null);
  const t = providerTitle(p);
  assert.equal(t.date, null);
  assert.equal(t.title, 'Is the Acme API free? Yes: no end date (check date not stated)');
});

test('every provider page: <title>, h1, meta description, first sentence, JSON-LD name and FAQ ask the same question', () => {
  for (const p of PROVIDERS) {
    const t = providerTitle(p);
    assert.ok(t.title.length <= TITLE_MAX || p.name.length > 40, `${p.slug}: ${t.title.length} characters: ${t.title}`);
    assert.equal(t.date, providerDateModified(p), `${p.slug}: dated by the newest fact`);
    const html = read(`site/p/${p.slug}.html`);
    assert.equal(titleOf(html), `${t.title} · Free LLM API Hub`, `${p.slug}: <title>`);
    assert.equal(h1Of(html), t.title, `${p.slug}: h1`);
    assert.ok(descOf(html).startsWith(`${t.question} ${t.verdict}: `), `${p.slug}: meta description opens with the answer: ${descOf(html)}`);
    const first = unescape(stripTags(html.match(/<p class="answer-first" id="is-it-free">([\s\S]*?)<\/p>/)[1]));
    if (t.verdict !== 'Not stated') assert.ok(first.startsWith(`${t.verdict}. `), `${p.slug}: the first sentence answers ${t.verdict}: ${first}`);
    const graph = graphOf(html);
    assert.equal(graph.find((n) => n['@type'] === 'WebPage').name, t.title, `${p.slug}: JSON-LD name`);
    assert.equal(graph.find((n) => n['@type'] === 'FAQPage').mainEntity[0].name, t.question, `${p.slug}: FAQPage question`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://[^"]+/p/${p.slug}">`), `${p.slug}: canonical unchanged`);
    const md = read(`site/p/${p.slug}.md`);
    assert.ok(md.startsWith(`# ${mdText(t.title)}\n\n`), `${p.slug}: Markdown title`);
    assert.ok(md.includes(`\n## ${mdText(t.question)}\n\n`), `${p.slug}: Markdown question`);
  }
  const llms = read('site/llms.txt');
  for (const p of PROVIDERS) assert.ok(llms.includes(`- [${mdText(providerTitle(p).title)}](`), `${p.slug}: llms.txt line`);
});
