// The agreements file (data/sponsorships.json): what it may hold, what the pages say about it, and that nothing paid
// reaches the dataset, the API files, llms.txt, the structured data of a page or the ranking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateTree } from './lib/private-tree.mjs';
import { agreementsErrors, agreementsTableHtml, sponsoredBlockHtml, disclosureHtml, inForce, AGREEMENT_TYPES } from './lib/agreements.mjs';
import { rankProviders } from './lib/score.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DAY = '2026-10-16';
const SLUGS = ['alpha', 'beta'];
const block = (o = {}) => ({ id: 'zorbit-block', company: 'Zorbit Labs', type: 'sponsored_block', since: '2026-10-01', until: null, receives: 'One labelled block on the agreements page.', does_not_receive: 'A place in the ranking, a score or an edit of the data.', data_checked_by: 'Free LLM API Hub, from its own pages.', last_review: '2026-10-10', url: 'https://zorbit.example/', text: 'Zorbit text ZORBITSENTINEL.', company_wrote_text: true, ...o });
const file = (o = {}) => ({ version: 1, generated: DAY, agreements: [], disclosures: [], ...o });
const errs = (f) => agreementsErrors(f, { slugs: SLUGS, generated: DAY });

test('the committed file is valid and empty today: no row, no money', () => {
  const f = JSON.parse(readFileSync(join(REPO, 'data/sponsorships.json'), 'utf8'));
  const data = JSON.parse(readFileSync(join(REPO, 'data/providers.json'), 'utf8'));
  assert.deepEqual(agreementsErrors(f, { slugs: data.providers.map((p) => p.slug), generated: data.generated }), []);
  assert.deepEqual(f.agreements, []);
});

test('a valid block, section, paid link and each kind of disclosure are accepted', () => {
  const f = file({
    agreements: [block(), block({ id: 'sec', type: 'sponsored_section', company_reviewed_text: false }), block({ id: 'lnk', type: 'paid_link', text: undefined, company_wrote_text: undefined })],
    disclosures: [{ slug: 'alpha', company: 'Alpha', kind: 'free_credit', since: '2026-09-01' }, { slug: 'beta', company: 'Beta', kind: 'personal', relation: 'The author of this site is a cousin of the founder.', since: '2026-09-01' }],
  });
  for (const a of f.agreements) for (const k of Object.keys(a)) if (a[k] === undefined) delete a[k];
  assert.deepEqual(errs(f), []);
});

test('each required thing missing or malformed is named, one test per rule', () => {
  const bad = (o, re) => assert.match(errs(file({ agreements: [block(o)] })).join(' | '), re);
  bad({ company: '' }, /company is required/);
  bad({ type: 'featured_slot' }, /type must be one of/);
  bad({ since: '2026-13-40' }, /since must be a day/);
  bad({ until: '2026-09-01' }, /until is before since/);
  bad({ receives: '' }, /receives is required/);
  bad({ does_not_receive: undefined }, /does_not_receive is required/);
  bad({ data_checked_by: '' }, /data_checked_by is required/);
  bad({ last_review: '2026-10-17' }, /last_review is after the dataset day/);
  bad({ url: 'http://zorbit.example/' }, /url must be https/);
  bad({ text: '' }, /sponsored text is required/);
  bad({ company_wrote_text: 'yes' }, /company_wrote_text must be true or false/);
  bad({ price: 100 }, /unknown key "price"/);
  assert.match(errs(file({ agreements: [block(), block()] })).join(), /duplicate id/);
  assert.match(errs(file({ generated: '2026-10-17' })).join(), /after the dataset day/);
  assert.match(errs(file({ disclosures: [{ slug: 'nope', company: 'X', kind: 'free_credit', since: DAY }] })).join(), /not a provider/);
  assert.match(errs(file({ disclosures: [{ slug: 'alpha', company: 'X', kind: 'personal', since: DAY }] })).join(), /needs "relation"/);
  assert.match(errs(file({ disclosures: [{ slug: 'alpha', company: 'X', kind: 'free_credit', relation: 'x', since: DAY }] })).join(), /relation is only for kind personal/);
  assert.match(errs(file({ disclosures: [{ slug: 'alpha', company: 'X', kind: 'cash', since: DAY }] })).join(), /kind must be one of/);
});

test('the words the labels do not use (featured, partner, recommended) fail in any text of a row', () => {
  for (const w of ['featured', 'Partner', 'recommended']) {
    for (const k of ['company', 'receives', 'does_not_receive', 'text']) assert.match(errs(file({ agreements: [block({ [k]: `a ${w} thing` })] })).join(), /a word the labels do not use/, `${k}: ${w}`);
  }
  assert.match(errs(file({ disclosures: [{ slug: 'alpha', company: 'A', kind: 'personal', relation: 'A partner of mine.', since: DAY }] })).join(), /a word the labels do not use/);
});

test('the table is computed from the rows: empty says so in those words, a row appears only inside its dates', () => {
  assert.match(agreementsTableHtml(file(), DAY), /<strong>No agreement is in force\.<\/strong> \(as of 2026-10-16\)/);
  const f = file({ agreements: [block(), block({ id: 'past', company: 'Past Co', since: '2026-09-01', until: '2026-09-30' }), block({ id: 'later', company: 'Later Co', since: '2026-11-01' })] });
  assert.deepEqual(inForce(f, DAY).map((a) => a.id), ['zorbit-block']);
  const html = agreementsTableHtml(f, DAY);
  assert.match(html, /Zorbit Labs/); assert.doesNotMatch(html, /Past Co|Later Co|No agreement is in force/);
  for (const col of ['Company', 'Type', 'Since', 'Until', 'What it receives', 'What it does not receive', 'Who checked its data', 'Last review of this row']) assert.ok(html.includes(`>${col}</th>`), col);
  assert.equal(inForce(f, '2026-09-30').map((a) => a.id).includes('past'), true, 'the last day counts');
});

test('a sponsored block says in text that it is paid, outside the ranking, that the company did not edit the data and who wrote the text', () => {
  const h = sponsoredBlockHtml(block());
  assert.match(h, /<strong>Sponsored<\/strong> Paid placement\. Not part of the ranking and not affected by it\./);
  assert.match(h, /aria-label="Sponsored\. Paid placement\. Not part of the ranking and not affected by it\."/);
  assert.match(h, /Zorbit Labs paid for this block\. It did not edit any data on this site\./);
  assert.match(h, /Text written by Zorbit Labs/);
  assert.match(h, /rel="sponsored nofollow noopener"/);
  assert.match(h, /href="\/agreements\/#agreements">Agreements and policy<\/a>/, 'the link works from any page, not only from /agreements/');
  assert.match(agreementsTableHtml(file({ agreements: [block()] }), DAY), /rel="sponsored nofollow noopener"[^>]*>Zorbit Labs<\/a>|>Zorbit Labs<\/a>/);
  assert.match(agreementsTableHtml(file({ agreements: [block()] }), DAY), /<td>no end date<\/td>/);
  assert.doesNotMatch(sponsoredBlockHtml(block({ company_wrote_text: false })), /Text written by/);
  const s = sponsoredBlockHtml(block({ type: 'sponsored_section', company_reviewed_text: false }));
  assert.match(s, /Sponsored by Zorbit Labs\.<\/strong> Written and verified by Free LLM API Hub\. Zorbit Labs did not edit the data\. Zorbit Labs did not review this text\./);
  assert.match(sponsoredBlockHtml(block({ type: 'sponsored_section', company_reviewed_text: true })), /Zorbit Labs did review this text/);
  assert.equal(h.includes('<script'), false); assert.equal(sponsoredBlockHtml(block({ text: '<script>x</script>' })).includes('<script>'), false, 'the text is escaped');
});

test('a disclosure says no money was paid, says what was given and stays with its own provider', () => {
  const f = file({ disclosures: [{ slug: 'alpha', company: 'Alpha', kind: 'early_access', since: DAY }, { slug: 'beta', company: 'Beta', kind: 'personal', relation: 'The author is a cousin of the founder.', since: DAY }] });
  assert.match(disclosureHtml(f, 'alpha'), /<strong>Disclosure:<\/strong> Alpha gave us early access to try its service\. No money was paid\. It does not change how Alpha is scored or described\./);
  assert.match(disclosureHtml(f, 'beta'), /The author is a cousin of the founder\. It does not change how Beta is scored/);
  assert.equal(disclosureHtml(f, 'gamma'), '');
  assert.doesNotMatch(disclosureHtml(f, 'alpha'), /Partner/i);
});

test('the retired fields are named, and the schema no longer has them', () => {
  const RETIRED = ['partner', 'partner_note'];
  const schema = readFileSync(join(REPO, 'data/schema.json'), 'utf8');
  for (const k of RETIRED) assert.equal(schema.includes(`"${k}"`), false, k);
  assert.deepEqual(Object.keys(AGREEMENT_TYPES), ['sponsored_block', 'sponsored_section', 'paid_link']);
});

test('validate rejects a provider that carries partner or partner_note', () => {
  const data = JSON.parse(readFileSync(join(REPO, 'data/providers.json'), 'utf8'));
  for (const k of ['partner', 'partner_note']) {
    const d = structuredClone(data); d.providers[0][k] = k === 'partner' ? true : 'x';
    const fixture = join(privateTree(REPO), 'providers-' + k + '.json');
    writeFileSync(fixture, JSON.stringify(d));
    assert.throws(() => execFileSync(process.execPath, ['scripts/validate.mjs', fixture], { cwd: privateTree(REPO), stdio: 'pipe' }), (e) => new RegExp(`/providers/0/${k} must NOT have additional properties`).test(String(e.stderr)), k);
  }
});

test('the score reads nothing of the agreements: any record field of money leaves every score identical', () => {
  const data = JSON.parse(readFileSync(join(REPO, 'data/providers.json'), 'utf8'));
  const ed = JSON.parse(readFileSync(join(REPO, 'data/editorial.json'), 'utf8'));
  const probe = JSON.parse(readFileSync(join(REPO, 'data/probe-report.json'), 'utf8'));
  const run = (extra) => rankProviders(data.providers.map((p) => ({ ...p, ...extra })), { editorial: ed, probeReport: probe, now: new Date(data.generated + 'T12:00:00Z') }).map((r) => [r.slug, r.total, r.math]);
  assert.deepEqual(run({ sponsored: true, paid: 1000, partner: true }), run({}));
});

test('built with a paid row and a disclosure: the text is on the agreements page and the provider page, and in no other file', () => {
  const ROOT = privateTree(REPO);
  const dataPath = join(ROOT, 'data/providers.json');
  const slug = JSON.parse(readFileSync(dataPath, 'utf8')).providers[0].slug;
  const gen = JSON.parse(readFileSync(dataPath, 'utf8')).generated;
  writeFileSync(join(ROOT, 'data/sponsorships.json'), JSON.stringify(file({
    generated: gen,
    agreements: [block({ since: '2020-01-01', last_review: '2020-01-02' })],
    disclosures: [{ slug, company: 'DISCLOSEDCO', kind: 'free_credit', since: '2020-01-01' }],
  })));
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'pipe' });
  const hits = [];
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      if (n === 'node_modules' || n === '.git') continue;
      const f = join(dir, n);
      if (statSync(f).isDirectory()) { walk(f); continue; }
      if (!/\.(html|json|txt|xml|md|yaml|js|css)$/.test(n)) continue;
      const t = readFileSync(f, 'utf8');
      if (/ZORBITSENTINEL|Zorbit Labs|DISCLOSEDCO/.test(t)) hits.push(relative(ROOT, f));
    }
  };
  for (const d of ['site', 'collections', '.']) if (d !== '.') walk(join(ROOT, d));
  for (const n of ['README.md', 'llms.txt', 'llms-full.txt', 'badge-freshness.json', 'badge-verified.json']) if (existsSync(join(ROOT, n))) { const t = readFileSync(join(ROOT, n), 'utf8'); if (/ZORBITSENTINEL|Zorbit Labs|DISCLOSEDCO/.test(t)) hits.push(n); }
  const allowed = new Set(['site/agreements/index.html'].concat(readdirSync(join(ROOT, 'site/p')).filter((n) => n === slug || n === slug + '.html').map((n) => 'site/p/' + n + (statSync(join(ROOT, 'site/p', n)).isDirectory() ? '/index.html' : ''))));
  assert.ok(hits.includes('site/agreements/index.html'), 'the agreements page shows the row');
  assert.ok(hits.some((h) => h.startsWith('site/p/')), 'the provider page shows the disclosure');
  assert.deepEqual(hits.filter((h) => !allowed.has(h)), [], 'nothing paid anywhere else: not the API files, llms.txt, providers.json, the structured data, the ranking or the sitemap');
  const page = readFileSync(join(ROOT, 'site/agreements/index.html'), 'utf8');
  assert.match(page, /Zorbit Labs paid for this block\. It did not edit any data on this site\./);
  assert.doesNotMatch(page, /No agreement is in force/);
  // the structured data of the agreements page itself says nothing about the row either
  for (const m of page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) assert.doesNotMatch(m[1], /Zorbit|ZORBIT/);
  // and the provider page, which does carry the disclosure in its text, keeps it out of its structured data
  const providerFile = ['site/p/' + slug + '.html', 'site/p/' + slug + '/index.html'].find((f) => existsSync(join(ROOT, f)));
  const providerPage = readFileSync(join(ROOT, providerFile), 'utf8');
  assert.match(providerPage, /DISCLOSEDCO/, 'the provider page shows the disclosure');
  const ld = [...providerPage.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(ld.length > 0, 'the provider page has structured data');
  for (const m of ld) assert.doesNotMatch(m[1], /DISCLOSEDCO|Zorbit|ZORBIT/);
});
