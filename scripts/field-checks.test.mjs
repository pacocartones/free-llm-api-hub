// field_checks: why a tri-state flag holds its value (data/schema.json, scripts/lib/field-checks.mjs).
// The validator rules, the quote registry kind, the site wording, the coverage counts and the v1 projection.
import { escapeHtml } from './lib/html.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTmpDir } from './lib/tmp.mjs';
import { FIELD_CHECK_FIELDS, TERMS_FLAG_FIELDS, NULL_REASONS, REASON_LABEL, fieldCheckErrors, fieldCheckStatus, fieldCheckCounts, UNSOURCED_ALLOWLIST, hasReceipt, unsourcedFlagErrors, unsourcedAllowlistErrors } from './lib/field-checks.mjs';
import { quoteErrors } from './lib/quotes.mjs';
import { mergeRegistry, fieldEntriesFor } from './lib/quotes-add.mjs';
import { triStateHtml, clientBundle } from './lib/compare.mjs';
import { requirementsHtml } from './lib/provider-sections.mjs';
import { coverage, coverageMainHtml } from './lib/coverage.mjs';
import { toApiV1Provider, apiV1ProviderSchema } from './lib/api-v1.mjs';
import { ORDER, serialize } from './_serialize.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const SCHEMA = JSON.parse(readFileSync(join(ROOT, 'data/schema.json'), 'utf8'));
const VALIDATE = join(ROOT, 'scripts/validate.mjs');
const TODAY = '2026-11-24';

function runValidate(data, env = {}) {
  const dir = makeTmpDir('flah-field-checks-');
  const providersFile = join(dir, 'providers.json');
  const reportFile = join(dir, 'probe-report.json');
  writeFileSync(providersFile, JSON.stringify(data));
  writeFileSync(reportFile, JSON.stringify({ probed_at: data.generated, count: data.providers.length, results: data.providers.map((p) => ({ slug: p.slug })) }));
  const r = spawnSync(process.execPath, [VALIDATE, providersFile, reportFile], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, VALIDATE_TODAY: '2099-01-01', ...env } });
  return { status: r.status, output: `${r.stdout}${r.stderr}` };
}

/** A copy of the dataset with one verified provider's flag set to `value` and its check to `check`. */
function withCheck(field, value, check) {
  const data = structuredClone(DATA);
  const p = data.providers.find((x) => x.verified === true && x.slug === 'groq') || data.providers.find((x) => x.verified === true);
  p[field] = value;
  if (field === 'commercial_ok' && value !== 'conditional') delete p.commercial_ok_condition;
  // Merged, not replaced: the provider's other flags keep their checks (and their quotes), so only `field` is under test.
  p.field_checks = { ...p.field_checks, [field]: check };
  return { data, p };
}

const silent = { status: 'source_silent', checked: '2026-11-24', sources: ['https://example.com/terms'] };

test('the schema and the lib agree on the flags and the statuses', () => {
  const def = SCHEMA.$defs.provider.properties.field_checks;
  assert.deepEqual(Object.keys(def.properties), FIELD_CHECK_FIELDS);
  assert.deepEqual(SCHEMA.$defs.field_check.properties.status.enum, ['stated', ...NULL_REASONS]);
  assert.equal(def.additionalProperties, false);
  assert.ok(ORDER.indexOf('field_checks') === ORDER.indexOf('verified') - 1, 'field_checks is written just before verified');
});

test('validate: a reason on a null flag and a stated check on a known flag pass', () => {
  const { data } = withCheck('commercial_ok', null, silent);
  const groq = data.providers.find((x) => x.slug === 'groq');
  groq.field_checks.card_required = { status: 'stated', checked: '2026-11-24', sources: ['https://example.com/pricing'], quote: 'No credit card required.', note: 'The pricing page says no card is needed' };
  groq.card_required = false;
  const r = runValidate(data);
  assert.equal(r.status, 0, r.output);
});

const BAD = [
  ['a reason on a known value', () => withCheck('phone_required', true, silent).data, 'so its check must be stated'],
  ['stated on a null flag', () => withCheck('phone_required', null, { ...silent, status: 'stated' }).data, 'cannot be stated'],
  ['sources_disagree with one source', () => withCheck('card_required', null, { ...silent, status: 'sources_disagree', note: 'x' }).data, 'needs the two pages that disagree'],
  ['sources_disagree without a note', () => withCheck('card_required', null, { ...silent, status: 'sources_disagree', sources: ['https://example.com/a', 'https://example.com/b'] }).data, 'needs a note'],
  ['a check dated after today', () => withCheck('card_required', null, { ...silent, checked: '2099-01-02' }).data, '.checked must be a date not after today'],
  ['a private source', () => withCheck('card_required', null, { ...silent, sources: ['https://127.0.0.1/terms'] }).data, "must be the provider's public HTTPS page"],
  ['a guillemet passage in the note', () => withCheck('card_required', null, { ...silent, note: 'the page says «no card»' }).data, 'must not put passages between'],
  ['a quote on a reason', () => withCheck('card_required', null, { ...silent, quote: 'We never ask for a card.' }).data, 'a quote goes with stated only'],
];
for (const [name, make, message] of BAD) {
  test(`validate rejects ${name}`, () => {
    const r = runValidate(make());
    assert.notEqual(r.status, 0, r.output);
    assert.ok(r.output.includes(message), r.output);
  });
}

test('validate (schema) rejects an unknown flag, an unknown status, an http source and an empty map', () => {
  for (const [mutate, why] of [
    [(p) => { p.field_checks = { free_tier: silent }; }, 'unknown flag'],
    [(p) => { p.field_checks = { card_required: { ...silent, status: 'no' } }; }, 'unknown status'],
    [(p) => { p.field_checks = { card_required: { ...silent, sources: ['http://example.com/'] } }; }, 'http source'],
    [(p) => { p.field_checks = {}; }, 'empty map'],
    [(p) => { p.field_checks = { card_required: { status: 'source_silent', checked: '2026-11-24' } }; }, 'no sources'],
  ]) {
    const data = structuredClone(DATA);
    const p = data.providers.find((x) => x.card_required === null) || data.providers[0];
    p.card_required = null;
    mutate(p);
    const r = runValidate(data);
    assert.notEqual(r.status, 0, why);
    assert.match(r.output, /schema/, why);
  }
});

test('fieldCheckErrors is quiet on a provider without field_checks, and the derived status is not_checked', () => {
  assert.deepEqual(fieldCheckErrors({ slug: 'x', card_required: null }, { today: TODAY }), []);
  assert.equal(fieldCheckStatus({ card_required: null }, 'card_required'), 'not_checked');
  assert.equal(fieldCheckStatus({ card_required: null, field_checks: { card_required: silent } }, 'card_required'), 'source_silent');
});

test('fieldCheckCounts splits nulls by reason and counts known values without a stated check as unsourced', () => {
  const ps = [
    { card_required: null },
    { card_required: null, field_checks: { card_required: silent } },
    { card_required: null, field_checks: { card_required: { ...silent, status: 'needs_account' } } },
    { card_required: false },
    { card_required: true, field_checks: { card_required: { ...silent, status: 'stated' } } },
  ];
  assert.deepEqual(fieldCheckCounts(ps, 'card_required'), { stated: 1, source_silent: 1, needs_account: 1, sources_disagree: 0, not_checked: 1, unsourced: 1 });
});

test('the dataset: every recorded check pairs with its flag value and the counts add up', () => {
  for (const p of DATA.providers) assert.deepEqual(fieldCheckErrors(p, { today: '2099-01-01' }), [], p.slug);
  for (const field of FIELD_CHECK_FIELDS) {
    const c = fieldCheckCounts(DATA.providers, field);
    assert.equal(Object.values(c).reduce((a, b) => a + b, 0), DATA.providers.length, field);
  }
});

test('serialize writes field_checks on one line, and a provider without it is unchanged', () => {
  // Every provider has field_checks now (and the terms flags with their checks), so take one and drop them.
  const p = structuredClone(DATA.providers[0]);
  delete p.field_checks;
  for (const f of TERMS_FLAG_FIELDS) delete p[f];
  const plain = serialize({ ...DATA, providers: [p] });
  const checked = serialize({ ...DATA, providers: [{ ...p, card_required: null, field_checks: { card_required: silent } }] });
  assert.ok(!plain.includes('field_checks'));
  assert.match(checked, /\n {6}"field_checks": \{"card_required":\{"status":"source_silent","checked":"2026-11-24","sources":\["https:\/\/example\.com\/terms"\]\}\},\n {6}"verified"/);
});

// ---------- quote registry: kind field_sentence ----------
const entry = (over = {}) => ({ id: 'acme.card_required.sentence', slug: 'acme', kind: 'field_sentence', field: 'card_required', text: 'No credit card required.', source_url: 'https://acme.example/pricing', read_on: TODAY, lang: 'en', method: 'html-text-v1: page requested in English, tags removed, character references decoded, white space collapsed', page_sha256: 'a'.repeat(64), ...over });
const stated = { status: 'stated', checked: TODAY, sources: ['https://acme.example/pricing'], quote: 'No credit card required.' };
const acme = (check = stated) => ({ providers: [{ slug: 'acme', card_required: false, field_checks: { card_required: check } }] });

test('quotes: a stated quote needs its field_sentence, byte for byte and from the first source', () => {
  assert.deepEqual(quoteErrors(acme(), { version: 1, entries: [entry()] }, { today: TODAY }), []);
  assert.match(quoteErrors(acme(), { version: 1, entries: [] }, { today: TODAY }).join('\n'), /has no field_sentence entry/);
  assert.match(quoteErrors(acme(), { version: 1, entries: [entry({ text: 'No card required.' })] }, { today: TODAY }).join('\n'), /not byte for byte/);
  assert.match(quoteErrors(acme(), { version: 1, entries: [entry({ source_url: 'https://acme.example/faq' })] }, { today: TODAY }).join('\n'), /another source/);
  assert.match(quoteErrors(acme({ ...stated, quote: null }), { version: 1, entries: [entry()] }, { today: TODAY }).join('\n'), /has no field_checks.card_required quote/);
  assert.match(quoteErrors(acme(), { version: 1, entries: [entry({ id: 'acme.card.sentence' })] }, { today: TODAY }).join('\n'), /<slug>\.<field>\.sentence/);
});

test('quotes:add --field writes only that sentence and a data_policy run keeps it', async () => {
  const read = async () => ({ ok: true, text: 'Pricing. No credit card required. Start now.' + ' x'.repeat(120) });
  const { entries, problems } = await fieldEntriesFor('acme', 'card_required', stated, read, { today: TODAY });
  assert.deepEqual(problems, []);
  assert.equal(entries[0].id, 'acme.card_required.sentence');
  const missing = await fieldEntriesFor('acme', 'card_required', { ...stated, quote: 'We never ask.' }, read, { today: TODAY });
  assert.match(missing.problems[0], /not literally on/);
  const data = { providers: [{ slug: 'acme' }] };
  const reg = { version: 1, entries: [{ id: 'acme.sentence', slug: 'acme', kind: 'sentence' }, entries[0]] };
  assert.deepEqual(mergeRegistry(reg, data, 'acme', []).entries.map((e) => e.id), ['acme.card_required.sentence'], 'a data_policy run replaces its own entries only');
  assert.deepEqual(mergeRegistry(reg, data, 'acme', [], { field: 'card_required' }).entries.map((e) => e.id), ['acme.sentence'], 'a --field run replaces that sentence only');
});

// ---------- site wording ----------
test('the site says the reason and the day instead of "not stated", and never turns null into no', () => {
  for (const s of NULL_REASONS) {
    const html = triStateHtml(null, 'required', 'not required', { ...silent, status: s });
    assert.ok(html.includes(`${escapeHtml(REASON_LABEL[s])} (checked 24 Nov 2026)`), s);
    assert.ok(!/not required/.test(html), s);
  }
  assert.equal(triStateHtml(null, 'required', 'not required'), '<span class="tri tri-unk">not stated</span>');
  assert.match(triStateHtml(null, 'a', 'b', { status: 'source_silent', checked: '<script>' }), /not stated in the provider&#39;s docs</);
  assert.ok(!triStateHtml(null, 'a', 'b', { status: 'source_silent', checked: '<script>' }).includes('<script>'));
  assert.equal(triStateHtml(false, 'required', 'not required', { ...silent, status: 'stated' }), '<span class="tri tri-no">not required</span>');
  assert.match(triStateHtml(null, 'a', 'b', { status: 'toString' }), /not stated/, 'a status that is not a reason reads not stated');
  // the browser bundle carries the same function, with the same words
  for (const words of Object.values(REASON_LABEL)) assert.ok(clientBundle().includes(JSON.stringify(words).slice(1, -1)), words);
});

test('the provider page lists the pages read and the day under a flag, escaped', () => {
  const p = { slug: 'acme', card_required: null, phone_required: false, commercial_ok: true, field_checks: {
    card_required: { status: 'sources_disagree', checked: TODAY, sources: ['https://acme.example/a', 'https://acme.example/b'], note: 'Docs say no card <b>; plans say add one' },
    commercial_ok: { status: 'stated', checked: TODAY, sources: ['https://acme.example/terms'], quote: 'You may use it commercially.' },
  } };
  const html = requirementsHtml(p);
  assert.match(html, /not stated: the provider&#39;s pages disagree \(checked 24 Nov 2026\)/);
  assert.match(html, /href="https:\/\/acme\.example\/a"[^>]*>page 1<\/a>, <a href="https:\/\/acme\.example\/b"[^>]*>page 2<\/a>/);
  assert.ok(html.includes('Docs say no card &lt;b&gt;; plans say add one'));
  assert.match(html, /&ldquo;You may use it commercially\.&rdquo; Per <a href="https:\/\/acme\.example\/terms"/);
  assert.ok(!requirementsHtml({ ...p, field_checks: { card_required: { ...p.field_checks.card_required, sources: ['javascript:alert(1)', 'https://acme.example/b'] } } }).includes('javascript:'));
});

// ---------- coverage ----------
test('coverage: a null with a reason is resolved, not open, and the reasons table counts every status', () => {
  const ps = [
    { slug: 'a', name: 'A', verified: true, docs_url: 'https://a.example/', card_required: null },
    { slug: 'b', name: 'B', verified: true, docs_url: 'https://b.example/', card_required: null, field_checks: { card_required: silent } },
    { slug: 'c', name: 'C', verified: true, docs_url: 'https://c.example/', card_required: false },
  ];
  const row = coverage(ps).find((r) => r.key === 'card_required');
  assert.deepEqual([row.total, row.confirmed, row.open.map((p) => p.slug), row.resolved.map((p) => p.slug)], [3, 1, ['a'], ['b']]);
  assert.equal(row.byStatus.source_silent, 1);
  assert.equal(coverage(ps).find((r) => r.key === 'model_tier').byStatus, undefined, 'only the flags have statuses');
  const html = coverageMainHtml(coverage(ps), { repo: 'https://github.com/o/r', generated: TODAY });
  assert.match(html, /<tr id="reasons-card_required"><th scope="row">card_required<\/th><td class="num">0<\/td><td class="num">1<\/td><td class="num">1<\/td><td class="num">1<\/td><td class="num">0<\/td><td class="num">0<\/td><\/tr>/);
  assert.match(html, /1 not stated, resolved without an answer/);
  assert.match(html, /<li class="cov-resolved"><a href="\.\.\/p\/b">B<\/a> <span class="sep">·<\/span> not stated in the provider&#39;s docs <span class="sep">·<\/span> checked <time datetime="2026-11-24">24 Nov 2026<\/time><\/li>/);
});

// ---------- API v1 ----------
test('API v1: field_checks passes through unchanged, is allowed by the v1 schema, and conditional still projects to null', () => {
  const p = { slug: 'x', commercial_ok: 'conditional', commercial_ok_condition: 'licence', field_checks: { commercial_ok: { ...silent, status: 'stated' } } };
  const v1 = toApiV1Provider(p);
  assert.equal(v1.commercial_ok, null);
  assert.deepEqual(v1.field_checks, p.field_checks);
  const schema = apiV1ProviderSchema(SCHEMA);
  assert.ok(schema.$defs.provider.properties.field_checks && schema.$defs.field_check, 'the published v1 schema describes the new field');
});

test('the source links under a flag are underlined, so they do not rely on colour alone (WCAG 1.4.1, Lighthouse link-in-text-block)', () => {
  const css = readFileSync(join(ROOT, 'site/styles.css'), 'utf8');
  assert.match(css, /\.req-source a \{[^}]*text-decoration: underline/);
  // the links are plain anchors inside the req-source block on provider and model pages alike
  assert.match(requirementsHtml({ slug: 'x', card_required: null, field_checks: { card_required: silent } }), /<div class="req-source muted">Read <a href="https:\/\/example\.com\/terms"/);
});

// ---------- the receipts rule: a flag with a value carries the provider's sentence ----------
const quoted = { status: 'stated', checked: TODAY, sources: ['https://acme.example/pricing'], quote: 'No credit card required.' };

test('receipts: a value with a stated, quoted check passes; null needs nothing', () => {
  assert.deepEqual(unsourcedFlagErrors({ slug: 'acme', card_required: false, field_checks: { card_required: quoted } }, { today: TODAY, allowlist: [] }), []);
  assert.deepEqual(unsourcedFlagErrors({ slug: 'acme', card_required: null, phone_required: null, commercial_ok: null, openai_compatible: null }, { today: TODAY, allowlist: [] }), []);
  assert.equal(hasReceipt({ card_required: false, field_checks: { card_required: { ...quoted, quote: '  ' } } }, 'card_required'), false, 'a blank quote is no receipt');
});

test('receipts: a value with no check, a reason, or a stated check without a quote fails, for every flag', () => {
  for (const field of FIELD_CHECK_FIELDS) {
    for (const [why, fc] of [['no check', undefined], ['stated without a quote', { [field]: { ...quoted, quote: null } }], ['a reason', { [field]: silent }]]) {
      const value = field === 'commercial_ok' ? 'conditional' : true;
      const errors = unsourcedFlagErrors({ slug: 'acme', [field]: value, ...(fc ? { field_checks: fc } : {}) }, { today: TODAY, allowlist: [] });
      assert.equal(errors.length, 1, `${field}, ${why}`);
      assert.match(errors[0], new RegExp(`acme: ${field} is .* with no provider sentence: record a stated field_checks\\.${field} with its quote \\(npm run quotes:add -- acme --field ${field}\\)`));
    }
  }
});

test('receipts: an allowlisted flag passes until its day, then fails', () => {
  const p = { slug: 'acme', openai_compatible: true };
  const allowlist = [{ slug: 'acme', field: 'openai_compatible', until: '2026-12-31', reason: 'the page renders only with JavaScript' }];
  assert.deepEqual(unsourcedFlagErrors(p, { today: '2026-12-31', allowlist }), []);
  assert.match(unsourcedFlagErrors(p, { today: '2027-01-01', allowlist }).join('\n'), /on the unsourced allowlist until 2026-12-31, which has passed/);
});

test('receipts: the allowlist is well-formed, time-boxed and only holds flags that still need it', () => {
  const ps = [{ slug: 'acme', card_required: true }, { slug: 'done', card_required: false, field_checks: { card_required: quoted } }, { slug: 'nul', card_required: null }];
  const ok = { slug: 'acme', field: 'card_required', until: '2026-12-31', reason: 'the site answers HTTP 403' };
  assert.deepEqual(unsourcedAllowlistErrors(ps, { allowlist: [ok] }), []);
  for (const [entry, message] of [
    [{ ...ok, field: 'free_tier' }, /names a provider slug and one of/],
    [{ ...ok, until: 'soon' }, /until must be a date/],
    [{ ...ok, reason: ' ' }, /says why the flag could not be sourced/],
    [{ ...ok, slug: 'ghost' }, /no provider has that slug/],
    [{ ...ok, slug: 'done' }, /null or sourced now, so remove the entry/],
    [{ ...ok, slug: 'nul' }, /null or sourced now, so remove the entry/],
  ]) assert.match(unsourcedAllowlistErrors(ps, { allowlist: [entry] }).join('\n'), message, JSON.stringify(entry));
  assert.match(unsourcedAllowlistErrors(ps, { allowlist: [ok, ok] }).join('\n'), /listed twice/);
});

test('validate (the real script): an unsourced value fails, and an expired allowlist entry fails', () => {
  const { data } = withCheck('card_required', true, { ...quoted, quote: null });
  const r = runValidate(data);
  assert.notEqual(r.status, 0, r.output);
  assert.match(r.output, /card_required is true with no provider sentence/);
  const [first] = UNSOURCED_ALLOWLIST;
  if (first) {
    const expired = runValidate(structuredClone(DATA), { VALIDATE_ALLOWLIST_TODAY: '2999-01-01' });
    assert.notEqual(expired.status, 0, expired.output);
    assert.match(expired.output, new RegExp(`${first.slug}: ${first.field} is on the unsourced allowlist until ${first.until}, which has passed`));
  }
});

test('the dataset: every flag with a value has a receipt or a live allowlist entry, and every entry ends within 60 days of today', () => {
  const today = new Date().toISOString().slice(0, 10);
  for (const p of DATA.providers) assert.deepEqual(unsourcedFlagErrors(p, { today }), [], p.slug);
  assert.deepEqual(unsourcedAllowlistErrors(DATA.providers), []);
  const limit = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  for (const a of UNSOURCED_ALLOWLIST) assert.ok(a.until <= limit, `${a.slug}.${a.field}: an allowlist entry is time-boxed (until ${a.until} is more than 60 days away)`);
});
