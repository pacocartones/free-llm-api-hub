// The home FAQ, below the provider table (lib/home-faq.mjs), and the home <title> and meta description for the search
// "free llm api". Every number in an answer is recounted here from data/providers.json, independently of the module; a
// field the dataset does not record is counted as "not stated"; the visible FAQ and the FAQPage JSON-LD on the built
// page are the same text; the section sits below the table, never in the hero.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homeFaq, homeFaqHtml, homeFaqJsonLd, homeMeta, answerText, NOT_STATED, HOME_TITLE_MAX, HOME_DESC_MAX } from './lib/home-faq.mjs';
import { recommendedCmp, SLA_DAYS } from './lib/rules.mjs';
import { shortDate } from './lib/provider-meta.mjs';
import { privateTree } from './lib/private-tree.mjs';

const ROOT = privateTree(join(import.meta.dirname, '..'));
before(() => { execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' }); });
const PROVIDERS = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data/providers.json'), 'utf8')).providers;
const built = () => readFileSync(join(ROOT, 'site/index.html'), 'utf8');
const decode = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const n = (x) => x.toLocaleString('en-US');
const count = (pred) => PROVIDERS.filter(pred).length;
const unknown = (k) => count((p) => p[k] === null || p[k] === undefined);
const ranked = [...PROVIDERS].sort(recommendedCmp);
const top3 = (pred) => ranked.filter(pred).slice(0, 3);
// Every number written in a text, in order ("1,000" is one number; a date's day and year count too).
const numbers = (s) => [...s.matchAll(/\d[\d,]*/g)].map((m) => Number(m[0].replace(/,/g, '')));

test('six questions, the ones people ask, in this order', () => {
  assert.deepEqual(homeFaq(PROVIDERS).map((it) => it.q), [
    'Is there a free LLM API?',
    'Which free LLM API has the highest limits?',
    'Which free LLM APIs need no credit card?',
    'Can I use a free LLM API commercially?',
    'Which free LLM APIs are OpenAI-compatible?',
    'How fresh is this data?',
  ]);
});

test('every number in every answer is recounted from data/providers.json, and nothing else is a number', () => {
  const total = PROVIDERS.length;
  const verified = count((p) => p.verified === true);
  const items = Object.fromEntries(homeFaq(PROVIDERS).map((it) => [it.id, answerText(it)]));

  assert.deepEqual(numbers(items['faq-is-there']), [total, count((p) => p.category === 'ongoing'), count((p) => p.category === 'trial'), verified]);

  const text = ranked.filter((p) => p.category === 'ongoing' && p.verified === true && p.is_text_llm === true);
  const cap = (p) => (p.free_limits && Number.isInteger(p.free_limits.requests_per_day) ? p.free_limits.requests_per_day : null);
  const capped = text.filter((p) => cap(p) !== null).sort((a, b) => cap(b) - cap(a));
  assert.ok(capped.length >= 1, 'at least one text LLM publishes a daily cap');
  assert.deepEqual(numbers(items['faq-highest-limits']), [text.length, capped.length, ...capped.slice(0, 3).map(cap), text.length - capped.length]);
  for (const p of capped.slice(0, 3)) assert.ok(items['faq-highest-limits'].includes(`${p.name} (${n(cap(p))} requests a day)`), p.slug);
  for (let i = 1; i < capped.length; i++) assert.ok(cap(capped[i - 1]) >= cap(capped[i]), 'highest first');

  assert.deepEqual(numbers(items['faq-no-card']), [count((p) => p.card_required === false), total, count((p) => p.card_required === true), unknown('card_required')]);
  assert.deepEqual(numbers(items['faq-commercial']), [count((p) => p.commercial_ok === true), count((p) => p.commercial_ok === 'conditional'), count((p) => p.commercial_ok === false), unknown('commercial_ok')]);
  assert.deepEqual(numbers(items['faq-openai']), [count((p) => p.openai_compatible === true), total, count((p) => p.openai_compatible === false), unknown('openai_compatible')]);

  const dates = PROVIDERS.filter((p) => p.verified === true && p.last_verified).map((p) => p.last_verified).sort();
  const dayYear = (d) => numbers(shortDate(d));
  const unverified = total - verified;
  assert.deepEqual(numbers(items['faq-fresh']), [verified, total, ...dayYear(dates[0]), ...dayYear(dates.at(-1)), SLA_DAYS, ...(unverified ? [unverified] : [])]);
  assert.ok(items['faq-fresh'].includes(`from ${shortDate(dates[0])} to ${shortDate(dates.at(-1))}`));
});

test('the providers named are the first three in the recommended order (the table order), each linked to its page', () => {
  const faq = Object.fromEntries(homeFaq(PROVIDERS).map((it) => [it.id, it]));
  const named = (id) => faq[id].segments.filter((s) => s.href && s.href.startsWith('p/')).map((s) => s.href.slice(2));
  assert.deepEqual(named('faq-is-there'), ranked.slice(0, 3).map((p) => p.slug));
  assert.deepEqual(named('faq-no-card'), top3((p) => p.card_required === false).map((p) => p.slug));
  assert.deepEqual(named('faq-commercial'), top3((p) => p.commercial_ok === true).map((p) => p.slug));
  assert.deepEqual(named('faq-openai'), top3((p) => p.openai_compatible === true).map((p) => p.slug));
  for (const it of Object.values(faq)) for (const s of it.segments.filter((x) => x.href && x.href.startsWith('p/'))) {
    assert.equal(s.text, PROVIDERS.find((p) => p.slug === s.href.slice(2)).name, `${it.id}: the link text is the provider's name`);
  }
});

test('an unknown value is counted as "not stated", never guessed', () => {
  const blank = { slug: 'blank', name: 'Blank', category: 'ongoing', card_required: null, commercial_ok: null, openai_compatible: null, verified: false };
  const items = Object.fromEntries(homeFaq([blank]).map((it) => [it.id, answerText(it)]));
  assert.match(items['faq-no-card'], new RegExp(`for 1 it is ${NOT_STATED}`));
  assert.match(items['faq-commercial'], new RegExp(`for 1 it is ${NOT_STATED}`));
  assert.match(items['faq-openai'], new RegExp(`for 1 it is ${NOT_STATED}`));
  assert.match(items['faq-highest-limits'], new RegExp(`daily request cap is ${NOT_STATED}`));
  assert.match(items['faq-fresh'], new RegExp(`Verification dates: ${NOT_STATED}`));
  for (const a of Object.values(items)) assert.doesNotMatch(a, /undefined|null|NaN|probably/);
});

test('the FAQ escapes what comes from the data', () => {
  const evil = { slug: 'x', name: 'Acme <b>"', category: 'ongoing', card_required: false, commercial_ok: true, openai_compatible: true, verified: true, last_verified: '2026-11-20' };
  const html = homeFaqHtml(homeFaq([evil]));
  assert.ok(!html.includes('<b>'), 'no markup from the data survives');
  assert.match(html, /<a href="p\/x">Acme &lt;b&gt;&quot;<\/a>/);
});

test('built home: the visible FAQ is the FAQPage JSON-LD, word for word, in the page\'s one JSON-LD block', () => {
  const html = built();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1, 'still one JSON-LD block');
  const faqs = JSON.parse(blocks[0][1])['@graph'].filter((x) => x['@type'] === 'FAQPage');
  assert.equal(faqs.length, 1, 'one FAQPage node');
  const faq = faqs[0];
  assert.deepEqual(faq, JSON.parse(JSON.stringify(homeFaqJsonLd(homeFaq(PROVIDERS)))), 'built from the current data');
  const visible = [...html.matchAll(/<div class="faq-item" id="(faq-[a-z-]+)"><h3>([^<]*)<\/h3><p>([\s\S]*?)<\/p><\/div>/g)];
  assert.equal(visible.length, 6);
  assert.equal(faq.mainEntity.length, 6);
  faq.mainEntity.forEach((q, i) => {
    assert.equal(q['@type'], 'Question');
    assert.equal(q.acceptedAnswer['@type'], 'Answer');
    assert.equal(decode(visible[i][2]), q.name, `question ${i + 1}: visible text equals the JSON-LD`);
    assert.equal(decode(visible[i][3]), q.acceptedAnswer.text, `answer ${i + 1}: visible text equals the JSON-LD`);
    assert.ok(q.acceptedAnswer.text.length > 80, 'a real answer');
    assert.match(visible[i][3], /<a href="/, `answer ${i + 1} links onward`);
  });
});

test('built home: the FAQ sits below the table, inside main, not in the hero; every link resolves in the build', () => {
  const html = built();
  const table = html.indexOf('</table>');
  const faq = html.indexOf('<section class="home-faq"');
  assert.ok(table > 0 && faq > table, 'below the table');
  assert.ok(faq < html.indexOf('</main>'), 'inside the main landmark');
  assert.doesNotMatch(html.match(/<section class="hero">([\s\S]*?)<\/section>/)[1], /faq/i, 'not in the hero');
  const section = html.slice(faq, html.indexOf('</section>', faq));
  for (const [, href] of section.matchAll(/<a href="([^"]+)"/g)) {
    const file = href.endsWith('/') ? `${href}index.html` : `${href}.html`;
    assert.ok(existsSync(join(ROOT, 'site', file)), `${href} exists in the build`);
  }
});

test('home <title> and description lead with "free llm api" and carry the live provider count and "verified"', () => {
  const html = built();
  const title = decode(html.match(/<title>([^<]*)<\/title>/)[1]);
  const desc = decode(html.match(/<meta name="description" content="([^"]*)">/)[1]);
  const total = PROVIDERS.length;
  const verified = count((p) => p.verified === true);
  assert.match(title, /^Free LLM API/i);
  assert.match(desc, /^Free LLM API/i);
  assert.ok(title.length <= HOME_TITLE_MAX, `${title.length} characters: ${title}`);
  assert.ok(desc.length <= HOME_DESC_MAX, `${desc.length} characters: ${desc}`);
  for (const s of [title, desc]) {
    assert.ok(s.includes(`${total} providers`), `the live provider count: ${s}`);
    assert.ok(s.includes(`${verified} verified`), `the verified count: ${s}`);
  }
  assert.equal(decode(html.match(/<meta property="og:title" content="([^"]*)">/)[1]), title);
  assert.equal(decode(html.match(/<meta property="og:description" content="([^"]*)">/)[1]), desc);
  assert.equal(decode(html.match(/<meta name="twitter:title" content="([^"]*)">/)[1]), title);
  assert.equal(decode(html.match(/<meta name="twitter:description" content="([^"]*)">/)[1]), desc);
});

test('homeMeta stays inside the limits when the counts grow', () => {
  const many = Array.from({ length: 1234 }, (_, i) => ({ slug: `p${i}`, name: `P${i}`, category: i % 2 ? 'trial' : 'ongoing', verified: true }));
  const { title, description } = homeMeta(many, { month: 'Sep 2027' });
  assert.ok(title.length <= HOME_TITLE_MAX, title);
  assert.ok(description.length <= HOME_DESC_MAX, description);
  assert.match(description, /1,234 providers/);
});
