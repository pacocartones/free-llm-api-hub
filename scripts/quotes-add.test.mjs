import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { entriesFor, mergeRegistry, readText } from './lib/quotes-add.mjs';
import { quoteErrors } from './lib/quotes.mjs';
import { sha256, METHOD } from './lib/page-text.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const filler = 'filler words so that the page has some text. '.repeat(10);
const pageOf = (body) => ({ ok: true, text: `${body} ${filler}`.replace(/\s+/g, ' ').trim() });
const opts = { today: '2026-10-15' };

test('entriesFor: the sentence, each phrase between guillemets and the absence check, with day, hash, language and method written by the tool', async () => {
  const policy = { source: 'https://a.example/t', quote: 'We do not train.', note: 'Section «Training», and «Opt out».' };
  const { entries, problems } = await entriesFor('acme', policy, async () => pageOf('Training. Opt out. We do not train.'), opts);
  assert.deepEqual(problems, []);
  assert.deepEqual(entries.map((e) => e.id), ['acme.sentence', 'acme.note_passage.1', 'acme.note_passage.2']);
  for (const e of entries) { assert.equal(e.read_on, '2026-10-15'); assert.equal(e.lang, 'en'); assert.equal(e.method, METHOD); assert.match(e.page_sha256, /^[0-9a-f]{64}$/); assert.equal(e.source_url, 'https://a.example/t'); }
  assert.equal(entries[0].page_sha256, sha256(pageOf('Training. Opt out. We do not train.').text));
});
test('entriesFor: a quote or a passage that is not on the page is named and nothing is made up', async () => {
  const read = async () => pageOf('Something else entirely.');
  const a = await entriesFor('acme', { source: 'https://a.example/t', quote: 'We do not train.', note: '' }, read, opts);
  assert.match(a.problems.join(), /quote of acme is not literally on/); assert.deepEqual(a.entries, []);
  const b = await entriesFor('acme', { source: 'https://a.example/t', quote: null, note: 'See «Opt out».' }, read, opts);
  assert.match(b.problems.join(), /passage «Opt out» .* is not on .*--passage-url/);
});
test('entriesFor: a passage may come from another page, said with its address', async () => {
  const read = async (u) => (u === 'https://faq.example/x' ? pageOf('Free users cannot opt out.') : pageOf('The terms.'));
  const policy = { source: 'https://a.example/t', quote: null, note: '«Free users cannot opt out.»' };
  assert.match((await entriesFor('acme', policy, read, opts)).problems.join(), /not on https:\/\/a\.example\/t/);
  const ok = await entriesFor('acme', policy, read, { ...opts, passageUrls: { 'Free users cannot opt out.': 'https://faq.example/x' } });
  assert.deepEqual(ok.problems, []); assert.equal(ok.entries[0].source_url, 'https://faq.example/x');
});
test('entriesFor: a claim about the whole page is backed by a count of zero, or refused', async () => {
  const policy = { source: 'https://a.example/t', quote: null, note: 'The page names no plan.' };
  const none = await entriesFor('acme', policy, async () => pageOf('Nothing about money.'), opts);
  assert.deepEqual(none.problems, []); assert.equal(none.entries[0].kind, 'absence_check'); assert.deepEqual(none.entries[0].hits, { free: 0, trial: 0, paid: 0, plan: 0 });
  const some = await entriesFor('acme', policy, async () => pageOf('There is a free trial.'), opts);
  assert.match(some.problems.join(), /says something about the whole page.*free/); assert.deepEqual(some.entries, []);
  const scoped = await entriesFor('acme', { ...policy, note: 'The sentence names no plan.' }, async () => pageOf('There is a free trial.'), opts);
  assert.deepEqual([scoped.problems, scoped.entries], [[], []], 'a claim about the sentence needs no check');
});
test('entriesFor: a page that cannot be read gives the reason, and nothing is written', async () => {
  const { entries, problems } = await entriesFor('acme', { source: 'https://a.example/t', quote: 'x', note: '' }, async () => ({ ok: false, why: 'https://a.example/t answered HTTP 403' }), opts);
  assert.deepEqual(entries, []); assert.match(problems[0], /HTTP 403/);
});
test('mergeRegistry: only the entries of that provider change, the order is the dataset order', () => {
  const data = { providers: [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }] };
  const e = (slug, kind, n = '') => ({ id: `${slug}.${kind}${n}`, slug, kind });
  const registry = { version: 1, note: 'n', entries: [e('a', 'sentence'), e('c', 'sentence'), e('c', 'note_passage', '.1')] };
  const out = mergeRegistry(registry, data, 'b', [e('b', 'note_passage', '.2'), e('b', 'sentence'), e('b', 'note_passage', '.1')]);
  assert.deepEqual(out.entries.map((x) => x.id), ['a.sentence', 'b.sentence', 'b.note_passage.1', 'b.note_passage.2', 'c.sentence', 'c.note_passage.1']);
  assert.equal(out.note, 'n');
  const replaced = mergeRegistry(out, data, 'c', [e('c', 'sentence')]);
  assert.deepEqual(replaced.entries.filter((x) => x.slug === 'c').map((x) => x.id), ['c.sentence'], 'the old entries of the provider are replaced, not added to');
});
test('readText: refuses a page in another language, a page with no text and an error status; accepts an English one', async () => {
  const res = (status, body, lang = '') => async () => new Response(body, { status, headers: lang ? { 'Content-Language': lang } : {} });
  const html = (lang, t) => `<html lang="${lang}"><body><p>${t} ${filler}</p></body></html>`;
  assert.equal((await readText('https://x.example', res(200, html('en', 'We do not train.')))).ok, true);
  assert.match((await readText('https://x.example', res(200, html('es-419', 'No entrenamos.')))).why, /not English/);
  assert.match((await readText('https://x.example', res(200, '<html><div id="root"></div></html>'))).why, /needs scripts/);
  assert.match((await readText('https://x.example', res(403, 'no'))).why, /HTTP 403/);
  assert.match((await readText('https://x.example', async () => { throw new Error('ECONNRESET'); })).why, /ECONNRESET/);
});

// the whole path of the command, with the page stubbed: read, make, merge, check
test('the whole path: entries made from a page, merged into the register, pass the consistency check; a row nobody wrote entries for does not', async () => {
  const url = 'https://acme.example/terms';
  const data = { version: '2.11.0', generated: '2026-10-15', providers: [
    { slug: 'other', data_policy: { trains_on_prompts: false, source: 'https://other.example/t', checked: '2026-10-15', quote: 'Other sentence.', note: null } },
    { slug: 'acme', data_policy: { trains_on_prompts: false, source: url, checked: '2026-10-15', quote: 'We do not train on your content.', note: 'Section «Opt out». The page names no plan.' } }] };
  const other = { id: 'other.sentence', slug: 'other', kind: 'sentence', text: 'Other sentence.', source_url: 'https://other.example/t', read_on: '2026-10-01', lang: 'en', method: METHOD, page_sha256: 'b'.repeat(64) };
  const registry = { version: 1, note: 'x', entries: [other] };
  assert.match(quoteErrors(data, registry).join('\n'), /acme: the quote of its data_policy has no sentence entry/, 'before the tool, the register is missing the row');
  const { entries, problems } = await entriesFor('acme', data.providers[1].data_policy, async () => pageOf('We do not train on your content. Section Opt out. Nothing else.'), opts);
  assert.deepEqual(problems, []);
  assert.deepEqual(entries.map((e) => e.kind), ['sentence', 'note_passage', 'absence_check']);
  const next = mergeRegistry(registry, data, 'acme', entries);
  assert.deepEqual(quoteErrors(data, next), []);
  assert.deepEqual(next.entries[0], other, 'the entries of the other provider are untouched, byte for byte');
});
test('the command: usage errors do not touch the register', () => {
  const run = (...a) => spawnSync('node', [join(ROOT, 'scripts/quotes-add.mjs'), ...a], { encoding: 'utf8' });
  const before = readFileSync(join(ROOT, 'data/quotes.json'), 'utf8');
  const none = run(); assert.equal(none.status, 2); assert.match(none.stderr, /usage/);
  const nobody = run('nobody-at-all'); assert.equal(nobody.status, 2); assert.match(nobody.stderr, /no provider with that slug/);
  assert.equal(readFileSync(join(ROOT, 'data/quotes.json'), 'utf8'), before);
});
test('the real register agrees with the data', () => {
  assert.deepEqual(quoteErrors(JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8')), JSON.parse(readFileSync(join(ROOT, 'data/quotes.json'), 'utf8'))), []);
});
