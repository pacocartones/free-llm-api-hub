import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { htmlToText, decodeEntities, collapse, sha256, absenceHits, ABSENCE_TERMS, METHOD, READ_HEADERS, declaredLanguage, sameLanguage, judgeReading } from './lib/page-text.mjs';
import { quoteErrors, noteSpans, claimsPageAbsence, totalHits } from './lib/quotes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---- the reading of a page
test('page text: tags and script out, references decoded, white space collapsed, curly quotes kept', () => {
  const html = '<html><head><style>p{}</style><script>var a="We do not train";</script></head><body><p>We  do&nbsp;not\n train</p><!-- no --><svg><text>x</text></svg>AI21&rsquo;s &amp; “ours” &#8217; &#x2019; &unknown; <noscript>nope</noscript></body></html>';
  assert.equal(htmlToText(html), 'We do not train AI21’s & “ours” ’ ’ &unknown;');
  assert.equal(decodeEntities('&AMP; &Eacute;'), '& &Eacute;', 'a capital that is not in the table is left as it is, never guessed');
  assert.equal(collapse(' a   b\n'), 'a b');
  assert.equal(sha256('x').length, 64);
});
test('absence hits: whole words, any case, plan and plans, not royalty-free as a prefix trick', () => {
  assert.deepEqual(absenceHits('Free plans. PLAN. A trial; trials. Paid, unpaid, prepaid. Plan-B.'), { free: 1, trial: 1, paid: 1, plan: 3 });
  assert.deepEqual(ABSENCE_TERMS, ['free', 'trial', 'paid', 'plan']);
  assert.equal(absenceHits('royalty-free').free, 1, 'a hyphen is a word boundary, so royalty-free counts: the check errs on the side of finding');
  assert.deepEqual(absenceHits('nothing here'), { free: 0, trial: 0, paid: 0, plan: 0 });
});
test('the request: English, recorded in the method', () => {
  assert.match(READ_HEADERS['Accept-Language'], /^en/);
  assert.match(METHOD, /requested in English/);
});
test('language: declared by header or html lang, compared by its first subtag, undeclared accepted', () => {
  assert.equal(declaredLanguage('<html lang="es-419">', ''), 'es-419');
  assert.equal(declaredLanguage('<html class="x" lang=en-US>', ''), 'en-US');
  assert.equal(declaredLanguage('<html lang="es">', 'en-GB, fr'), 'en-GB', 'the header wins');
  assert.equal(declaredLanguage('<html>', ''), null);
  assert.equal(sameLanguage('en', 'en-GB'), true); assert.equal(sameLanguage('en', 'es-419'), false); assert.equal(sameLanguage('en', null), true);
});
test('judging a reading: ok, expired, unreachable and other language are four different things', () => {
  const body = (lang, text) => `<html lang="${lang}"><body><p>${text} ${'filler '.repeat(60)}</p></body></html>`;
  const passage = 'we do not train on your content';
  const ok = { status: 200, html: body('en', `Yes, ${passage}.`) };
  assert.equal(judgeReading(ok, passage), 'ok');
  assert.equal(judgeReading({ status: 200, html: body('en', 'Now it says something else.') }, passage), 'expired');
  assert.equal(judgeReading({ status: 200, html: body('es-419', 'Ahora dice otra cosa.') }, passage), 'other_language', 'a Spanish copy is not an expired passage');
  assert.equal(judgeReading({ status: 200, html: body('es', `Yes, ${passage}.`) }, passage), 'other_language', 'even if the English words are in it');
  assert.equal(judgeReading({ status: 403, html: 'Just a moment...' }, passage), 'unreachable');
  assert.equal(judgeReading({ error: 'ECONNRESET' }, passage), 'unreachable');
  assert.equal(judgeReading({ status: 200, html: '<html lang="en"><body><div id="root"></div></body></html>' }, passage), 'unreachable', 'a page with no text (script only) cannot say');
  assert.equal(judgeReading({ status: 200, html: '<html><body><p>' + 'x '.repeat(200) + '</p></body></html>' }, passage), 'expired', 'a page that does not declare a language is read as it is');
  assert.equal(judgeReading({ status: 200, html: body('en', `Yes,  we do not\n train on   your content.`) }, passage), 'ok', 'white space is collapsed on both sides');
});

// ---- consistency of the register with the data
const SRC = 'https://example.com/terms';
const sha = 'a'.repeat(64);
const base = (extra = {}) => ({ id: 'acme.sentence', slug: 'acme', kind: 'sentence', text: 'We do not train.', source_url: SRC, read_on: '2026-10-15', lang: 'en', method: METHOD, page_sha256: sha, ...extra });
const world = () => ({
  data: { generated: '2026-10-15', providers: [{ slug: 'acme', data_policy: { trains_on_prompts: false, source: SRC, checked: '2026-10-15', quote: 'We do not train.', note: 'Section «Training».' } }] },
  registry: { version: 1, entries: [base(), base({ id: 'acme.note_passage.1', kind: 'note_passage', text: 'Training' })] },
});
const errs = (mutate) => { const w = world(); mutate(w); return quoteErrors(w.data, w.registry).join('\n'); };

test('register: a consistent world has no error', () => { assert.deepEqual(quoteErrors(world().data, world().registry), []); });
test('register: the sentence, the passages and the claims each have to match, byte for byte', () => {
  assert.match(errs((w) => { w.registry.entries[0].text = 'We do not train!'; }), /not byte for byte the quote/);
  assert.match(errs((w) => { w.registry.entries.shift(); }), /no sentence entry/);
  assert.match(errs((w) => { w.data.providers[0].data_policy.quote = null; }), /a sentence entry but no quote/);
  assert.match(errs((w) => { w.registry.entries[0].source_url = 'https://example.com/other'; }), /another source than its data_policy/);
  assert.match(errs((w) => { w.data.providers[0].data_policy.note = 'Section «Training» and «our own phrase».'; }), /no such passage/, 'an own phrase between guillemets fails');
  assert.match(errs((w) => { w.data.providers[0].data_policy.note = 'No passage.'; }), /does not carry/, 'a passage no note uses is an orphan');
  assert.match(errs((w) => { w.registry.entries[1].text = 'training'; }), /no such passage/, 'case counts');
  assert.match(errs((w) => { w.data.providers[0].data_policy.note = 'Section «Training» and «Training».'; }), /twice/);
});
test('register: every entry has its fields in order', () => {
  assert.match(errs((w) => { w.registry.entries[0].source_url = 'http://example.com/terms'; }), /https/);
  assert.match(errs((w) => { w.registry.entries[0].read_on = '2999-01-01'; }), /read_on/);
  assert.match(errs((w) => { w.registry.entries[0].read_on = 'yesterday'; }), /read_on/);
  assert.match(errs((w) => { w.registry.entries[0].method = 'by eye'; }), /method/);
  assert.match(errs((w) => { w.registry.entries[0].lang = ''; }), /lang/);
  assert.match(errs((w) => { w.registry.entries[0].page_sha256 = 'abc'; }), /page_sha256/);
  assert.deepEqual(quoteErrors(world().data, (() => { const r = world().registry; r.entries[0].page_sha256 = null; return r; })()), [], 'null = the page was not read');
  assert.match(errs((w) => { w.registry.entries[0].id = 'acme.note_passage.1'; }), /duplicate id/);
  assert.match(errs((w) => { w.registry.entries[0].slug = 'nobody'; }), /no data_policy/);
  assert.match(errs((w) => { w.registry.entries[0].kind = 'guess'; }), /unknown kind/);
  assert.match(errs((w) => { w.registry.entries[0].text = 'a​b'; w.data.providers[0].data_policy.quote = 'a​b'; }), /zero-width/);
  assert.match(errs((w) => { w.registry.entries[0].text = 'two  spaces'; w.data.providers[0].data_policy.quote = 'two  spaces'; }), /collapsed/);
  assert.match(errs((w) => { w.registry.entries[0].text = 'x'.repeat(401); w.data.providers[0].data_policy.quote = 'x'.repeat(401); }), /1 to 400/);
  assert.match(quoteErrors(world().data, { version: 2, entries: [] }).join(), /version 1/);
  assert.match(quoteErrors(world().data, null).join(), /version 1/);
});
test('register: a claim about the whole page needs an absence check at zero in the four words', () => {
  const claim = (w) => { w.data.providers[0].data_policy.note = 'Section «Training». The page names no plan.'; };
  const check = (hits, extra = {}) => ({ id: 'acme.absence_check', slug: 'acme', kind: 'absence_check', terms: ABSENCE_TERMS, hits, source_url: SRC, read_on: '2026-10-15', lang: 'en', method: METHOD, page_sha256: sha, ...extra });
  assert.match(errs(claim), /no absence check/);
  assert.equal(errs((w) => { claim(w); w.registry.entries.push(check({ free: 0, trial: 0, paid: 0, plan: 0 })); }), '', 'zero in the four words is enough');
  assert.match(errs((w) => { claim(w); w.registry.entries.push(check({ free: 0, trial: 0, paid: 0, plan: 2 })); }), /was read with/, 'one plan word and the claim is false');
  assert.match(errs((w) => { claim(w); w.registry.entries.push(check(null, { page_sha256: null })); }), /never read/, 'an unread page proves nothing');
  assert.match(errs((w) => { w.registry.entries.push(check({ free: 0, trial: 0, paid: 0, plan: 0 })); }), /no claim of the note uses/, 'a check nobody uses is an orphan');
  assert.match(errs((w) => { claim(w); w.registry.entries.push(check({ free: 0, trial: 0, paid: 0, plan: 0 }, { terms: ['free'] })); }), /terms must be exactly/);
  assert.match(errs((w) => { claim(w); w.registry.entries.push(check({ free: 0, trial: 0, paid: 0 })); }), /hits must be/);
  assert.match(errs((w) => { claim(w); w.registry.entries.push(check({ free: 0, trial: 0, paid: 0, plan: 0 }, { page_sha256: null })); }), /both null/);
  assert.match(errs((w) => { claim(w); w.registry.entries.push(check({ free: 0, trial: 0, paid: 0, plan: 0 }, { text: 'x' })); }), /no text/);
  assert.match(errs((w) => { claim(w); w.registry.entries.push(check({ free: 0, trial: 0, paid: 0, plan: 0 }, { source_url: 'https://example.com/other' })); }), /another source/);
});
test('claims about the whole page: which sentences count, and which are limited to the sentence and cannot be tested', () => {
  for (const yes of ['The page names no plan.', 'The page names no free plan; the clause speaks of x.', 'The policy has no mention of a free, trial, paid or other plan.', 'the page names no plan, so the free plan is neither included nor excluded', 'The terms have no mention of plans.']) assert.equal(claimsPageAbsence(yes), true, yes);
  for (const no of ['The sentence names no plan.', 'The clause names no plan; section 7 covers trials.', 'The page names no plan in this sentence.', 'it does not name the free plan', 'the answer does not name a plan', 'The data-use page refers to a Self-Serve Subscription Agreement.', '', null]) assert.equal(claimsPageAbsence(no), false, String(no));
  assert.deepEqual(noteSpans('a «one» b «two words» c «»'), ['one', 'two words', '']);
  assert.equal(totalHits({ free: 1, trial: 0, paid: 2, plan: 0 }), 3); assert.equal(totalHits(null), 0);
});

// ---- the real data and the real register
test('the real register is consistent with the real data (consistency only: it does not say the pages say that today)', () => {
  const data = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  const registry = JSON.parse(readFileSync(join(ROOT, 'data/quotes.json'), 'utf8'));
  assert.deepEqual(quoteErrors(data, registry), []);
  const withQuote = data.providers.filter((p) => p.data_policy && p.data_policy.quote).length;
  assert.equal(registry.entries.filter((e) => e.kind === 'sentence').length, withQuote, 'one sentence entry for every row that has a quote');
  assert.match(registry.note, /consistency only/i);
  for (const e of registry.entries) assert.equal(e.lang, 'en');
});
test('the data-policy page may exempt a phrase between guillemets only because the register has it', () => {
  const data = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  const registry = JSON.parse(readFileSync(join(ROOT, 'data/quotes.json'), 'utf8'));
  for (const p of data.providers.filter((x) => x.data_policy)) for (const sp of noteSpans(p.data_policy.note)) assert.ok(registry.entries.some((e) => e.slug === p.slug && e.kind === 'note_passage' && e.text === sp), `${p.slug}: «${sp.slice(0, 40)}» is in the register`);
});
