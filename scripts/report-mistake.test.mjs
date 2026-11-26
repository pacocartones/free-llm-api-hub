// "Something wrong? Report a mistake": every provider page, and every provider row of a model-family page, links to the
// data-correction issue form, prefilled through fields the form really has. Each test names its mutant.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { reportMistakeUrl, reportMistakeHtml, reportMistakeRowHtml, REPORT_TEMPLATE, REPORT_FIELDS, REPORT_LABEL } from './lib/report-mistake.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const REPO = 'https://github.com/pacocartones/free-llm-api-hub';
const SITE = 'https://freellmapihub.com';
const providers = JSON.parse(read('data/providers.json')).providers;
const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

before(() => {
  // CI regenerates site/ before the tests; locally, build once if the output predates this feature.
  const page = join(ROOT, `site/p/${providers[0].slug}.html`);
  if (!existsSync(page) || !readFileSync(page, 'utf8').includes('class="report-mistake')) {
    execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'ignore' });
  }
});

test('the template exists and has every field id the link fills', () => {
  // Mutant: rename the form or one of its ids (GitHub would then open a blank or the default issue form, silently).
  const path = `.github/ISSUE_TEMPLATE/${REPORT_TEMPLATE}`;
  assert.ok(existsSync(join(ROOT, path)), path);
  const yml = read(path);
  for (const id of Object.values(REPORT_FIELDS)) assert.match(yml, new RegExp(`\\n\\s+id: ${id}\\n`), `the form has the field "${id}"`);
  assert.match(yml, /\ntitle: "\[outdated\] "\n/, 'the title prefix the link repeats');
});

test('the URL prefills provider, title and the page, and survives awkward names', () => {
  // Mutant: drop encoding (a "&" or "#" in a name would cut the URL), or forget the page.
  const url = new URL(reportMistakeUrl({ slug: 'a-b', name: 'A&B "Labs" / 100% #1' }, { repo: REPO, pageUrl: `${SITE}/p/a-b` }));
  assert.equal(url.origin + url.pathname, `${REPO}/issues/new`);
  assert.equal(url.searchParams.get('template'), REPORT_TEMPLATE);
  assert.equal(url.searchParams.get('provider'), 'a-b');
  assert.equal(url.searchParams.get('title'), '[outdated] A&B "Labs" / 100% #1');
  assert.equal(url.searchParams.get('whats-wrong'), `Seen on ${SITE}/p/a-b\n\n`);
  assert.equal(url.hash, '');
  assert.doesNotMatch(url.search, /\+/, 'spaces as %20');
});

test('without a repository URL the link falls back to /contributing/', () => {
  // Mutant: build "undefined/issues/new" for a fork that has no repository URL.
  assert.equal(reportMistakeUrl({ slug: 'x', name: 'X' }, { prefix: '../' }), '../contributing/');
  const html = reportMistakeHtml({ slug: 'x', name: 'X' }, { prefix: '../' });
  assert.match(html, /<a class="report-link" href="\.\.\/contributing\/">Report a mistake<\/a>/);
  assert.doesNotMatch(html, /target="_blank"|undefined/);
  assert.match(reportMistakeRowHtml({ slug: 'x', name: 'X' }, { prefix: '../../' }), /href="\.\.\/\.\.\/contributing\/"/);
});

test('every provider page has the link at the end of the FAQ, for its own provider and page, and none in the hero', () => {
  // Mutant: skip a provider, prefill another provider's slug, or put the link in the hero (density).
  for (const p of providers) {
    const html = read(`site/p/${p.slug}.html`);
    const links = [...html.matchAll(/<a class="report-link" href="([^"]+)"/g)];
    assert.equal(links.length, 1, `${p.slug}: one "${REPORT_LABEL}" link`);
    const url = new URL(unescape(links[0][1]));
    assert.equal(url.origin + url.pathname, `${REPO}/issues/new`, p.slug);
    assert.equal(url.searchParams.get('template'), REPORT_TEMPLATE, p.slug);
    assert.equal(url.searchParams.get('provider'), p.slug, p.slug);
    assert.equal(url.searchParams.get('title'), `[outdated] ${p.name}`, p.slug);
    assert.equal(url.searchParams.get('whats-wrong'), `Seen on ${SITE}/p/${p.slug}\n\n`, p.slug);
    const faq = html.indexOf('<h2 id="faq">');
    const report = html.indexOf('class="report-mistake');
    assert.ok(faq > 0 && report > faq, `${p.slug}: after the FAQ heading`);
    assert.ok(!/<h2[ >]/.test(html.slice(faq + 5, report).replace(/^[^]*?<\/h2>/, '')), `${p.slug}: no other section between the FAQ and the link`);
    const hero = html.slice(0, html.indexOf('<main id="main">'));
    assert.doesNotMatch(hero, /report-mistake|report-link|template=inaccuracy/, `${p.slug}: nothing added to the hero`);
    assert.match(html.slice(report, report + 1200), /<a href="\.\.\/contributing\/">how corrections work<\/a>/, `${p.slug}: how corrections work`);
  }
});

test('every provider row of a model-family page has its own link', () => {
  // Mutant: one shared link for the whole table, or a row pointing at another provider.
  const dir = join(ROOT, 'site/free-api');
  const families = readdirSync(dir).filter((n) => existsSync(join(dir, n, 'index.html')));
  assert.ok(families.length > 0, 'family pages exist');
  for (const f of families) {
    const html = read(`site/free-api/${f}/index.html`);
    const rows = [...html.matchAll(/<tr><td class="name"><a href="\.\.\/\.\.\/p\/([a-z0-9-]+)">[\s\S]*?<\/tr>/g)];
    for (const [row, slug] of rows) {
      const m = row.match(/<a class="report-link" href="([^"]+)"/);
      assert.ok(m, `${f}/${slug}: the row has the link`);
      const url = new URL(unescape(m[1]));
      assert.equal(url.searchParams.get('template'), REPORT_TEMPLATE);
      assert.equal(url.searchParams.get('provider'), slug, `${f}/${slug}`);
      assert.equal(url.searchParams.get('whats-wrong'), `Seen on ${SITE}/free-api/${f}/\n\n`, `${f}/${slug}`);
    }
  }
});

test('no new third-party request: the link is a plain anchor, nothing is loaded from GitHub', () => {
  // Mutant: an embedded widget, image or script from github.com to show the form.
  const groq = read('site/p/groq.html');
  assert.doesNotMatch(groq, /<(script|img|iframe|link)\b[^>]*(src|href)="https:\/\/(github\.com|api\.github\.com|[^"]*githubusercontent\.com)/, 'no resource from GitHub');
  const css = read('site/styles.css');
  const rules = css.slice(css.indexOf('.report-mistake {'), css.indexOf('.report-mistake .report-note'));
  assert.doesNotMatch(rules, /url\(/, 'the styles load nothing');
  assert.match(rules, /var\(--accent\)/, 'Cálida tokens');
  assert.doesNotMatch(rules, /#[0-9a-f]{3,6}\b/i, 'no raw colour');
});
