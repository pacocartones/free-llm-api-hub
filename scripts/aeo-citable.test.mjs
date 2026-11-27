// Phase 2 of the SEO/AEO plan: the site as a source an answer engine can cite.
// - every provider page advertises its Markdown twin (<link rel="alternate" type="text/markdown">);
// - every fact on a provider page has a stable anchor (#is-it-free, #limits, #card, #phone, #commercial, #openai, …), the
//   twin lists them, and a page that shows several providers (a model page) does not repeat them;
// - the twin opens with the page's answer-first sentence, says "not stated" for an unknown and is the same bytes for the
//   same data;
// - llms.txt names who publishes and who creates the dataset and lists the API files; the JSON-LD of every page carries
//   the Organization (Tweakeo, publisher) and the Person (Paco Cartones, creator) with sameAs the GitHub account only.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateTree } from './lib/private-tree.mjs';
import { datasetAsOf } from './lib/release-stamp.mjs';
import { providerMarkdown, factAnchors, mdText } from './lib/provider-markdown.mjs';
import { answerFirst } from './lib/provider-faq.mjs';
import { providerTitle } from './lib/provider-title.mjs';
import { FACT_ANCHORS, requirementsHtml, glanceHtml } from './lib/provider-sections.mjs';
import { authorshipLine, websiteRef, datasetRef, CREATOR, PUBLISHER_NAME } from './lib/site-entity.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = privateTree(REPO);
const SITE = 'https://freellmapihub.com';
const REPO_URL = 'https://github.com/pacocartones/free-llm-api-hub';
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const head = (html) => html.slice(0, html.indexOf('</head>'));
const ids = (html) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const jsonLd = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

let data, providers, asOf;
before(() => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'pipe' });
  data = JSON.parse(read('data/providers.json'));
  providers = data.providers;
  asOf = datasetAsOf(data);
});

describe('provider pages: the Markdown alternate and the fact anchors', () => {
  test('every provider page advertises its Markdown twin in <head>, and the twin is built', () => {
    for (const p of providers) {
      const h = head(read(`site/p/${p.slug}.html`));
      const links = [...h.matchAll(/<link rel="alternate" type="text\/markdown"[^>]*>/g)].map((m) => m[0]);
      assert.equal(links.length, 1, `${p.slug}: one text/markdown alternate`);
      assert.ok(links[0].includes(` href="${SITE}/p/${p.slug}.md"`), `${p.slug}: ${links[0]}`);
      assert.match(links[0], / title="[^"]+"/, `${p.slug}: the alternate has a title`);
      assert.ok(existsSync(join(ROOT, `site/p/${p.slug}.md`)), `${p.slug}.md is built`);
    }
  });

  test('every fact has its stable anchor on every provider page, once', () => {
    for (const p of providers) {
      const all = ids(read(`site/p/${p.slug}.html`));
      for (const id of ['is-it-free', 'limits', 'card', 'phone', 'commercial', 'openai', 'quickstart', 'faq']) {
        assert.equal(all.filter((x) => x === id).length, 1, `${p.slug}: #${id} exactly once`);
      }
      assert.equal(new Set(all).size, all.length, `${p.slug}: no id twice (${all.filter((x, i) => all.indexOf(x) !== i)})`);
    }
  });

  test('each anchor sits on the fact it names', () => {
    for (const p of providers) {
      const html = read(`site/p/${p.slug}.html`);
      assert.match(html, /<div class="req" id="card"><dt>[\s\S]*?Credit card<\/dt>/, `${p.slug}: #card`);
      assert.match(html, /<div class="req" id="phone"><dt>[\s\S]*?Phone verification<\/dt>/, `${p.slug}: #phone`);
      assert.match(html, /<div class="req" id="commercial"><dt>[\s\S]*?Commercial use<\/dt>/, `${p.slug}: #commercial`);
      assert.match(html, /<div class="meta-row" id="openai"><span class="meta-k">OpenAI base URL<\/span>/, `${p.slug}: #openai`);
      assert.match(html, /<h2 id="limits">Free limits<\/h2>/, `${p.slug}: #limits`);
    }
  });

  test('a page that lists several providers does not repeat the anchors (model pages)', () => {
    const dir = join(ROOT, 'site/models');
    const pages = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join('site/models', d.name, 'index.html'));
    assert.ok(pages.length > 5);
    for (const page of pages) {
      const all = ids(read(page));
      for (const id of Object.values(FACT_ANCHORS)) assert.ok(!all.includes(id), `${page}: no #${id}`);
    }
  });

  test('anchors are opt-in in the shared section helpers', () => {
    const p = { slug: 'x', name: 'X', card_required: true, phone_required: null, commercial_ok: false, openai_base_url: 'https://x.example/v1', modalities: ['text'] };
    assert.doesNotMatch(requirementsHtml(p), /\sid="/);
    assert.doesNotMatch(glanceHtml(p, 'Ongoing'), /\sid="/);
    const withIds = requirementsHtml(p, { anchors: true }) + glanceHtml(p, 'Ongoing', { anchors: true });
    for (const id of Object.values(FACT_ANCHORS)) assert.ok(withIds.includes(` id="${id}"`), id);
  });

  test('a link to a fact inside the closed requirements box opens it (site.js)', () => {
    const js = readFileSync(join(REPO, 'site/site.js'), 'utf8');
    assert.match(js, /closest\('details'\)/);
    assert.match(js, /addEventListener\('hashchange'/);
  });
});

describe('/p/<slug>.md: answer first, "not stated", the anchors, the same bytes', () => {
  test('opens its answer with the answer-first sentence of the HTML page', () => {
    for (const p of providers) {
      const md = read(`site/p/${p.slug}.md`);
      const section = md.slice(md.indexOf(`## ${mdText(providerTitle(p).question)}\n\n`));
      assert.ok(section.split('\n')[2] === mdText(answerFirst(p).text), `${p.slug}: the first line of the answer is the answer-first sentence`);
    }
  });

  test('an unknown is "not stated", never "unknown" or "no"', () => {
    for (const p of providers) {
      const md = read(`site/p/${p.slug}.md`);
      assert.doesNotMatch(md, /\*\* unknown\b/, `${p.slug}: no "unknown" value`);
      for (const [field, label] of [['card_required', 'Credit card'], ['phone_required', 'Phone verification'], ['commercial_ok', 'Commercial use'], ['openai_compatible', 'OpenAI-compatible']]) {
        const line = md.split('\n').find((l) => l.startsWith(`- **${label}:** `));
        if (p[field] == null) assert.match(line, /^- \*\*[^*]+:\*\* not stated/, `${p.slug}.${field}: ${line}`);
      }
    }
  });

  test('lists every fact anchor, and each one exists on the HTML page', () => {
    for (const p of providers) {
      const md = read(`site/p/${p.slug}.md`);
      const html = ids(read(`site/p/${p.slug}.html`));
      const anchors = factAnchors(p, { site: SITE });
      assert.ok(md.includes('## Cite a fact\n\n'), `${p.slug}: the section`);
      for (const a of anchors) {
        assert.ok(md.includes(`- ${a.label}: ${a.url}\n`), `${p.slug}: lists #${a.id}`);
        assert.ok(html.includes(a.id), `${p.slug}: #${a.id} exists on the HTML page`);
      }
      for (const id of Object.values(FACT_ANCHORS)) assert.ok(anchors.some((a) => a.id === id), `${p.slug}: #${id} listed`);
    }
  });

  test('names the publisher, the creator and the repository', () => {
    for (const p of providers) assert.ok(read(`site/p/${p.slug}.md`).includes(`\n${authorshipLine(REPO_URL)}\n`), p.slug);
  });

  test('is deterministic: the same record gives the same bytes, whatever the clock or the time zone', () => {
    const opts = { site: SITE, asOf, version: data.version, repo: REPO_URL };
    for (const p of providers) {
      const a = providerMarkdown(structuredClone(p), opts);
      assert.equal(a, providerMarkdown(structuredClone(p), opts), p.slug);
      assert.equal(a, read(`site/p/${p.slug}.md`), `${p.slug}: the built file is the function of the record`);
    }
    // A second build in another time zone writes the same files.
    const before = Object.fromEntries(providers.map((p) => [p.slug, read(`site/p/${p.slug}.md`)]));
    execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, TZ: 'Pacific/Kiritimati' } });
    for (const p of providers) assert.equal(read(`site/p/${p.slug}.md`), before[p.slug], `${p.slug}: same bytes after a rebuild`);
  });

  test('refuses to build without the repository URL', () => {
    assert.throws(() => providerMarkdown(providers[0], { site: SITE, asOf, version: data.version }), /repo/);
  });
});

describe('llms.txt: authorship and the API files', () => {
  test('names the publisher and the creator before the first section', () => {
    const llms = read('site/llms.txt');
    const intro = llms.slice(0, llms.indexOf('\n## '));
    assert.ok(intro.includes(authorshipLine(REPO_URL)));
    assert.ok(intro.includes('`#card`') && intro.includes('`#limits`'), 'says the facts have anchors');
  });

  test('lists the API files, each built', () => {
    const llms = read('site/llms.txt');
    const section = llms.slice(llms.indexOf('\n## API files\n') + 1, llms.indexOf('\n\n## ', llms.indexOf('\n## API files\n') + 1));
    const urls = [...section.matchAll(/\]\((https:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
    for (const f of ['/api/v1/index.json', '/api/v1/providers.json', '/api/v1/status.json', '/api/v1/changes.json', '/api/v1/schema.json', '/providers.csv']) {
      assert.ok(urls.includes(`${SITE}${f}`), `lists ${f}`);
    }
    for (const u of urls) assert.ok(existsSync(join(ROOT, 'site', new URL(u).pathname)), `${u} is built`);
  });
});

describe('the entity: Tweakeo publishes, Paco Cartones creates', () => {
  test('every page that refers to the site or the dataset carries both, the Person with sameAs the GitHub account', () => {
    const facts = { description: 'd', license: 'https://opensource.org/licenses/MIT' };
    for (const node of [websiteRef(SITE), datasetRef(SITE, facts)]) {
      assert.deepEqual(node.publisher, { '@type': 'Organization', '@id': `${SITE}/#publisher`, name: PUBLISHER_NAME });
      assert.equal(node.creator['@type'], 'Person');
      assert.equal(node.creator['@id'], `${SITE}/#creator`);
      assert.equal(node.creator.name, 'Paco Cartones');
      assert.deepEqual(node.creator.sameAs, [CREATOR.url]);
      assert.equal(CREATOR.url, 'https://github.com/pacocartones');
    }
  });

  test('a provider page alone identifies the publisher and the creator, and invents no other profile', () => {
    for (const p of providers.slice(0, 10)) {
      const text = JSON.stringify(jsonLd(read(`site/p/${p.slug}.html`)));
      assert.ok(text.includes('"@type":"Organization","@id":"https://freellmapihub.com/#publisher","name":"Tweakeo, Inc."'), p.slug);
      assert.ok(text.includes('"sameAs":["https://github.com/pacocartones"]'), `${p.slug}: the Person's sameAs`);
      const sameAs = [...text.matchAll(/"sameAs":(\[[^\]]*\]|"[^"]*")/g)].flatMap((m) => [].concat(JSON.parse(m[1])));
      for (const u of sameAs) assert.ok(['https://github.com/pacocartones', REPO_URL].includes(u), `${p.slug}: unexpected sameAs ${u}`);
    }
  });

  test('the home page graph: Organization and Person with their @id, sameAs only the GitHub URLs that exist', () => {
    const [block] = jsonLd(read('site/index.html'));
    const byType = Object.fromEntries(block['@graph'].map((n) => [n['@type'], n]));
    assert.equal(byType.Organization.name, PUBLISHER_NAME);
    assert.equal(byType.Organization.sameAs, undefined, 'no profile is invented for Tweakeo');
    assert.deepEqual(byType.Person.sameAs, ['https://github.com/pacocartones']);
    assert.deepEqual(byType.WebSite.sameAs, [REPO_URL]);
    assert.equal(byType.WebSite.publisher['@id'], byType.Organization['@id']);
    assert.equal(byType.WebSite.creator['@id'], byType.Person['@id']);
  });
});
