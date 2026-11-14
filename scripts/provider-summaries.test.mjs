// The summaries of the providers: five short lines, each from the provider's own pages, each with its source and the day it
// was read. These tests pin the rule (every way the file can lie is an error) and what the page shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { privateTree } from './lib/private-tree.mjs';
import { summaryErrors, aboutHtml, registrableDomain, ownDomains, SUMMARY_FIELDS } from './lib/provider-summaries.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const providers = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8')).providers;
const doc = JSON.parse(readFileSync(join(ROOT, 'data/provider-summaries.json'), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));

const P = [{ slug: 'acme', name: 'Acme', docs_url: 'https://docs.acme.ai/start', openai_base_url: 'https://api.acme.ai/v1' }];
const good = () => ({
  version: '1', exceptions: {},
  summaries: [{
    id: 'acme', what: 'Acme makes an API.', good_for: 'Small tests.', operator: 'Acme Inc.', owner: '', origin: '',
    sources: [{ url: 'https://acme.ai/about', fetched_at: '2026-10-19', supports: ['what', 'good_for', 'operator'] }],
  }],
});

test('the real file is sound against the real providers', () => {
  assert.deepEqual(summaryErrors(doc, providers), []);
  assert.ok(doc.summaries.length > 0);
});

test('a sound small file passes, and every way it can lie is an error', () => {
  assert.deepEqual(summaryErrors(good(), P), []);
  const bad = (mutate, re) => { const d = good(); mutate(d); const e = summaryErrors(d, P); assert.ok(e.some((x) => re.test(x)), `${re}: ${JSON.stringify(e)}`); };
  // Mutant: a line with text that no source supports (what the rule exists for).
  bad((d) => { d.summaries[0].owner = 'Acme Holdings'; }, /owner has no source that supports it/);
  bad((d) => { d.summaries[0].sources[0].supports = ['what', 'good_for']; }, /operator has no source/);
  bad((d) => { d.summaries[0].sources[0].supports.push('owner'); }, /supports owner, which is empty/);
  bad((d) => { d.summaries[0].sources[0].supports.push('what'); }, /repeats a line/);
  bad((d) => { d.summaries[0].sources[0].supports.push('price'); }, /price, which is not a line/);
  bad((d) => { d.summaries[0].sources[0].supports = []; }, /supports must be a non-empty list/);
  bad((d) => { d.summaries[0].sources = []; }, /sources must be a non-empty list/);
  bad((d) => { d.summaries[0].id = 'nobody'; }, /not a provider/);
  bad((d) => { d.summaries.push(clone(d.summaries[0])); }, /appears twice/);
  bad((d) => { delete d.summaries[0].origin; }, /missing key origin/);
  bad((d) => { d.summaries[0].price = '1'; }, /unknown key price/);
  bad((d) => { d.summaries[0].what = 5; }, /what must be a string/);
  bad((d) => { d.summaries[0].what = ' Acme makes an API. '; }, /plain text/);
  bad((d) => { d.summaries[0].what = 'Acme <b>makes</b> an API.'; }, /plain text/);
  bad((d) => { d.summaries[0].what = 'Acme​ makes an API.'; }, /plain text/);
  bad((d) => { d.summaries[0].what = 'a'.repeat(501); }, /limit is 500/);
  bad((d) => { for (const f of SUMMARY_FIELDS) d.summaries[0][f] = ''; d.summaries[0].sources[0].supports = ['what']; }, /every line is empty/);
  bad((d) => { d.summaries[0].sources[0].url = 'http://acme.ai/about'; }, /https URL/);
  bad((d) => { d.summaries[0].sources[0].url = 'https://user:pw@acme.ai/about'; }, /https URL without credentials/);
  bad((d) => { d.summaries[0].sources[0].url = 'not a url'; }, /https URL/);
  bad((d) => { d.summaries[0].sources[0].fetched_at = '2026-02-30'; }, /real day/);
  bad((d) => { d.summaries[0].sources[0].fetched_at = '19 October'; }, /real day/);
  bad((d) => { d.summaries[0].sources[0].extra = 1; }, /unknown key extra/);
  bad((d) => { d.extra = 1; }, /unknown key extra/);
});

test('the page must be the provider\'s own: its domain, or a host named under exceptions with its reason, and an exception nobody uses is an error', () => {
  const off = () => { const d = good(); d.summaries[0].sources[0].url = 'https://parent.example/news'; return d; };
  // Mutant: take the check away and a page of anybody would source a line about the provider.
  assert.ok(summaryErrors(off(), P).some((e) => /parent\.example is not a domain of the provider/.test(e)));
  const withReason = off(); withReason.exceptions = { acme: { 'parent.example': 'The press release of the parent company that owns Acme.' } };
  assert.deepEqual(summaryErrors(withReason, P), []);
  const short = off(); short.exceptions = { acme: { 'parent.example': 'owner' } };
  assert.ok(summaryErrors(short, P).some((e) => /needs a plain-text reason of at least 20/.test(e)));
  const unused = good(); unused.exceptions = { acme: { 'other.example': 'A reason that is long enough to be read.' } };
  assert.ok(summaryErrors(unused, P).some((e) => /not used by any source: remove it/.test(e)));
  const ghost = good(); ghost.exceptions = { nobody: { 'x.example': 'A reason that is long enough to be read.' } };
  assert.ok(summaryErrors(ghost, P).some((e) => /not a provider/.test(e)));
  const otherProvider = off(); otherProvider.exceptions = { zzz: { 'parent.example': 'A reason that is long enough to be read.' } };
  assert.ok(summaryErrors(otherProvider, [...P, { slug: 'zzz', name: 'Z' }]).some((e) => /parent\.example is not a domain/.test(e)), 'an exception of another provider does not open this one');
  // A subdomain of the provider is its own; a lookalike is not.
  const sub = good(); sub.summaries[0].sources[0].url = 'https://www.docs.acme.ai/x'; assert.deepEqual(summaryErrors(sub, P), []);
  const fake = good(); fake.summaries[0].sources[0].url = 'https://acme.ai.evil.example/x';
  assert.ok(summaryErrors(fake, P).length > 0);
  const fake2 = good(); fake2.summaries[0].sources[0].url = 'https://notacme.ai/x';
  assert.ok(summaryErrors(fake2, P).length > 0, 'a name that only ends the same is not the domain');
});

test('registrable domains: two labels, three under a country second level', () => {
  assert.equal(registrableDomain('docs.acme.ai'), 'acme.ai');
  assert.equal(registrableDomain('acme.ai'), 'acme.ai');
  assert.equal(registrableDomain('a.b.acme.co.uk'), 'acme.co.uk');
  assert.equal(registrableDomain('www.acme.com.cn'), 'acme.com.cn');
  assert.deepEqual([...ownDomains(P[0])], ['acme.ai']);
});

test('the real exceptions each name a host that a source uses, and every source outside the provider\'s domains is one of them', () => {
  const bySlug = new Map(providers.map((p) => [p.slug, p]));
  const used = new Set();
  for (const s of doc.summaries) {
    const own = ownDomains(bySlug.get(s.id));
    for (const src of s.sources) {
      const host = new URL(src.url).hostname.toLowerCase().replace(/^www\./, '');
      if (!own.has(registrableDomain(host))) { assert.ok(doc.exceptions[s.id]?.[host], `${s.id}: ${host} is outside its domains and has no exception`); used.add(`${s.id}/${host}`); }
    }
  }
  assert.ok(used.size > 0 && used.size === Object.values(doc.exceptions).reduce((n, h) => n + Object.keys(h).length, 0), 'every exception is used by a source, and no host lacks one');
  assert.ok(Object.keys(doc.exceptions).length > 0);
});

test('aboutHtml: each line with its sources and day, escaped; nothing for a provider with no summary', () => {
  assert.equal(aboutHtml(undefined, 'Acme'), '');
  const html = aboutHtml({ ...good().summaries[0], what: 'Acme & <Co> "API"' }, 'A<cme>');
  assert.match(html, /<h2 id="about">About A&lt;cme&gt;<\/h2>/);
  assert.match(html, /Acme &amp; &lt;Co&gt; &quot;API&quot;|Acme &amp; &lt;Co&gt; "API"/, 'the text is escaped');
  assert.doesNotMatch(html, /<Co>|<cme>/);
  assert.match(html, /<dt>What it is<\/dt>/);
  assert.match(html, /<dt>Operated by<\/dt>/);
  assert.doesNotMatch(html, /<dt>Owned by<\/dt>|<dt>Origin<\/dt>/, 'an empty line is not shown');
  assert.match(html, /<a href="https:\/\/acme\.ai\/about" target="_blank" rel="noopener">acme\.ai<\/a>, read 2026-10-19/);
  assert.equal((html.match(/<div class="about-row">/g) || []).length, 3);
});

test('the provider pages show the summaries of the file, and only those; the links of the block are underlined', () => {
  const out = privateTree(ROOT);
  execFileSync(process.execPath, [join(out, 'scripts/build.mjs')], { cwd: out, stdio: 'pipe' });
  const withSummary = new Set(doc.summaries.map((s) => s.id));
  for (const p of providers) {
    const page = readFileSync(join(out, `site/p/${p.slug}.html`), 'utf8');
    if (!withSummary.has(p.slug)) { assert.doesNotMatch(page, /id="about"/, `${p.slug} has no summary and no About block`); continue; }
    const s = doc.summaries.find((x) => x.id === p.slug);
    assert.match(page, /<h2 id="about">About /, `${p.slug}: the About block`);
    const rows = (page.match(/<div class="about-row">/g) || []).length;
    assert.equal(rows, SUMMARY_FIELDS.filter((f) => s[f]).length, `${p.slug}: one row per line that has text`);
    assert.equal((page.match(/class="about-src"/g) || []).length, rows, `${p.slug}: a source under every line`);
  }
  const css = readFileSync(join(ROOT, 'site/styles.css'), 'utf8');
  assert.match(css, /\.prov-about a \{[^}]*text-decoration: underline/, 'links in the block do not rely on colour (Lighthouse link-in-text-block)');
});
