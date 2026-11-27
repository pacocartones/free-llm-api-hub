// The /not-free/ and /embed/ ("Use the data") pages: they are built, every internal link resolves, "Notably NOT free"
// has one source (data/not-free.json) for the README and the page, its quotes are the ones already recorded, and the
// Cite block is CITATION.cff.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateTree } from './lib/private-tree.mjs';
import { escapeHtml, escapeText } from './lib/html.mjs';
import { notFreeErrors, notFreeReadmeMd, closestAlternatives, entryQuotes } from './lib/not-free.mjs';
import { citationRecord, bibtex, apa } from './lib/citation.mjs';
import { Script, createContext } from 'node:vm';
import { widgetSnippet, WIDGET_DEFAULT, providerBadgeMarkdown, providerBadgeHtml } from './lib/embed-page.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = privateTree(REPO);
const SITE = 'https://freellmapihub.com';
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const PAGES = {
  notFree: 'site/not-free/index.html',
  embed: 'site/embed/index.html',
  api: 'site/api/index.html',
  quality: 'site/quality/index.html',
};

let NF, providers, quotes, cff;
before(() => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'pipe' });
  NF = json('data/not-free.json');
  providers = json('data/providers.json').providers;
  quotes = json('data/quotes.json').entries;
  cff = read('CITATION.cff');
});

const jsonLdTypes = (html) => {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'a JSON-LD block');
  const doc = JSON.parse(m[1]);
  return (doc['@graph'] || [doc]).map((n) => n['@type']);
};

describe('both pages', () => {
  test('are built, canonical, in the sitemap, with JSON-LD and no Product or Offer', () => {
    const sitemap = read('site/sitemap.xml');
    for (const [rel, path] of [[PAGES.notFree, '/not-free/'], [PAGES.embed, '/embed/']]) {
      assert.ok(existsSync(join(ROOT, rel)), `${rel} is built`);
      const html = read(rel);
      assert.ok(html.includes(`<link rel="canonical" href="${SITE}${path}">`), `${rel}: canonical`);
      assert.ok(sitemap.includes(`<loc>${SITE}${path}</loc>`), `${path} is in the sitemap`);
      const types = jsonLdTypes(html);
      assert.ok(types.includes('BreadcrumbList'), `${rel}: breadcrumb`);
      assert.doesNotMatch(html, /"@type":\s*"(Product|Offer|AggregateRating)"/, `${rel}: no Product/Offer`);
      const desc = html.match(/<meta name="description" content="([^"]*)"/)[1];
      assert.ok(desc.length <= 155, `${rel}: description fits a snippet`);
    }
  });

  test('load no third-party script', () => {
    for (const rel of Object.values(PAGES)) {
      for (const [, src] of read(rel).matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) {
        assert.doesNotMatch(src, /^(https?:)?\/\//, `${rel}: ${src} is first-party`);
      }
    }
  });

  test('every internal link resolves to a built file', () => {
    const exists = (t) => [t, t + '.html', join(t, 'index.html')].some((c) => existsSync(c) && statSync(c).isFile());
    let checked = 0;
    for (const rel of Object.values(PAGES)) {
      const file = join(ROOT, rel);
      for (const [, href] of read(rel).matchAll(/<a\s[^>]*?href="([^"#?]*)(?:[#?][^"]*)?"/g)) {
        if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) continue;
        checked++;
        assert.ok(exists(join(dirname(file), href)), `${rel} -> ${href}`);
      }
    }
    assert.ok(checked > 30, `checked ${checked} links`);
  });

  test('are linked from the footer, the guides, the comparisons, the API page and the provider pages', () => {
    for (const rel of ['site/index.html', 'site/api/index.html', 'site/p/groq.html']) {
      const footer = read(rel).split('<footer')[1];
      assert.match(footer, /href="(\.\.\/)?not-free\/"/, `${rel}: footer links /not-free/`);
      assert.match(footer, /href="(\.\.\/)?embed\/"/, `${rel}: footer links /embed/`);
    }
    assert.match(read('site/api/index.html'), /<main[\s\S]*href="\.\.\/embed\/"/, '/api/ links /embed/');
    assert.match(read('site/guides/free-llm-api-no-signup.html'), /<main[\s\S]*href="\.\.\/not-free\/"/, 'a guide links /not-free/');
    const pair = read('site/sitemap.xml').match(/\/compare\/([a-z0-9-]+-vs-[a-z0-9-]+)\//)[1];
    assert.match(read(`site/compare/${pair}/index.html`), /href="\.\.\/\.\.\/not-free\/"/, 'a comparison links /not-free/');
    for (const p of providers) {
      const html = read(`site/p/${p.slug}.html`);
      assert.ok(html.includes(`href="../embed/?p=${p.slug}#provider-badge">Embed this provider's badge</a>`), `${p.slug}: badge link`);
      const nf = NF.entries.find((e) => e.slug === p.slug);
      if (nf) assert.ok(html.includes(`href="../not-free/#${nf.id}"`), `${p.slug}: links its /not-free/ entry`);
    }
  });
});

describe('/not-free/: one source for the README and the page', () => {
  test('data/not-free.json is valid against the dataset and the quote register', () => {
    assert.deepEqual(notFreeErrors(NF, { providers, quotes }), []);
  });

  test('the validator rejects what would mislead', () => {
    const bad = structuredClone(NF);
    bad.entries[0].slug = 'no-such-provider';
    bad.entries[1].checked = 'last week';
    bad.entries[2].quote_ids = ['no.such.quote'];
    bad.entries[3].sources = [];
    bad.entries.push({ ...bad.entries[4] });
    const errs = notFreeErrors(bad, { providers, quotes }).join('\n');
    for (const re of [/not in data\/providers\.json/, /checked must be/, /not in data\/quotes\.json/, /a quote needs its source/, /duplicate id/]) assert.match(errs, re);
  });

  test('the README section is exactly the generated one, with nothing hand-written beside it', () => {
    const readme = read('README.md');
    const section = readme.slice(readme.indexOf('## Notably NOT free'), readme.indexOf('\n## ', readme.indexOf('## Notably NOT free') + 3));
    assert.equal(section.trim(), `## Notably NOT free\n\n<!-- AUTOGEN:not-free:start -->\n${notFreeReadmeMd(NF, { site: SITE })}\n<!-- AUTOGEN:not-free:end -->`);
    // the committed README (not only the private build) is in sync too
    assert.ok(readFileSync(join(REPO, 'README.md'), 'utf8').includes(notFreeReadmeMd(NF, { site: SITE })), 'run npm run build');
  });

  test('every entry is on the page and in the README, with its date', () => {
    const html = read(PAGES.notFree);
    const readme = read('README.md');
    for (const e of NF.entries) {
      assert.ok(html.includes(`<section class="gpu-entry" id="${e.id}"><h3>${escapeHtml(e.name)}</h3>`), `${e.id} on the page`);
      assert.ok(readme.includes(`- **${e.name}** — `), `${e.id} in the README`);
      if (e.checked) assert.ok(html.includes(e.checked) && readme.includes(`checked ${e.checked}`), `${e.id}: date`);
    }
  });

  test('each quote is the one already recorded: verbatim in docs/sources.md with the same page and date, or in data/quotes.json', () => {
    const sources = read('docs/sources.md');
    for (const e of NF.entries) {
      for (const q of e.quotes) {
        const row = sources.split('\n').find((l) => l.startsWith('|') && l.includes(`"${q}"`));
        assert.ok(row, `${e.id}: "${q}" is in docs/sources.md`);
        for (const s of e.sources) assert.ok(row.includes(`(${s.url})`), `${e.id}: ${s.url} is the row's source`);
        assert.ok(row.includes(`| ${e.checked} |`), `${e.id}: read ${e.checked}, as in the row`);
      }
      for (const q of entryQuotes(e, quotes).filter((x) => (e.quote_ids || []).length && !e.quotes.includes(x.text))) {
        assert.ok(quotes.some((r) => r.text === q.text && r.read_on === q.read), `${e.id}: referenced quote`);
      }
      for (const q of entryQuotes(e, quotes)) assert.ok(read(PAGES.notFree).includes(`“${escapeHtml(q.text)}”`), `${e.id}: quote on the page`);
    }
  });

  test('alternatives are verified, ongoing, share a modality and are never the provider itself', () => {
    const html = read(PAGES.notFree);
    for (const e of NF.entries) {
      const alts = closestAlternatives(e, providers);
      assert.ok(alts.length > 0 && alts.length <= 3, `${e.id}: has alternatives`);
      for (const p of alts) {
        assert.equal(p.verified, true);
        assert.equal(p.category, 'ongoing');
        assert.notEqual(p.slug, e.slug);
        assert.ok(p.modalities.some((m) => e.modalities.includes(m)), `${e.id}: ${p.slug} shares a modality`);
      }
    }
    const openai = html.slice(html.indexOf('id="openai"'), html.indexOf('</section>', html.indexOf('id="openai"')));
    assert.match(openai, /Closest free alternatives<\/dt><dd><a href="\.\.\/p\/[a-z0-9-]+">/);
  });

  test('title, FAQ and JSON-LD answer the searches people make', () => {
    const html = read(PAGES.notFree);
    assert.match(html, /<title>[^<]*not free[^<]*OpenAI[^<]*GitHub Models[^<]*Mistral/i);
    const types = jsonLdTypes(html);
    assert.ok(types.includes('FAQPage') && types.includes('WebPage'));
    for (const q of ['Is the OpenAI API free?', 'Does GitHub Models still have a free tier?', 'Is there a free Mistral API?']) {
      assert.ok(html.includes(`<h3>${escapeHtml(q)}</h3>`), `FAQ: ${q}`);
      assert.ok(html.includes(`"name":"${q}"`), `JSON-LD FAQ: ${q}`);
    }
  });
});

describe('/embed/: Use the data', () => {
  test('the Cite block is generated from CITATION.cff', () => {
    const html = read(PAGES.embed);
    const r = citationRecord(cff);
    assert.equal(r.version, cff.match(/^version: "(.+)"$/m)[1]);
    assert.equal(r.date, cff.match(/^date-released: "(.+)"$/m)[1]);
    assert.equal(r.author, 'pacocartones');
    assert.equal(r.title, cff.match(/^title: "(.+)"$/m)[1]);
    assert.ok(html.includes(`<pre data-snippet="citation"><code id="cite-bibtex">${escapeText(bibtex(r))}</code></pre>`), 'BibTeX');
    assert.ok(html.includes(`<pre data-snippet="citation"><code id="cite-apa">${escapeText(apa(r))}</code></pre>`), 'APA');
    assert.match(bibtex(r), new RegExp(`version = \\{${r.version.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}\\}`));
    assert.equal(apa(r), `pacocartones. (${r.year}). ${r.title} (Version ${r.version}) [Data set]. ${r.url}`);
  });

  test('citation formatting escapes TeX specials and keeps braces balanced', () => {
    const b = bibtex({ author: 'A & B', title: 'x_{y} 100%', year: '2026', version: '1.0', url: 'https://e.x/', repository: '', license: 'MIT' });
    assert.match(b, /A \\& B/);
    assert.match(b, /\{\{x\\_y 100\\%\}\}/);
    assert.equal((b.match(/\{/g) || []).length, (b.match(/\}/g) || []).length);
  });

  test('the default widget snippet is the README one, and the preview uses the real widget', () => {
    const html = read(PAGES.embed);
    const snippet = widgetSnippet(WIDGET_DEFAULT, SITE);
    assert.ok(read('README.md').includes(snippet), 'same snippet as the README');
    assert.ok(html.includes(`<code id="embed-snippet">${escapeText(snippet)}</code>`));
    assert.match(html, /<div class="embed-preview" id="embed-preview"><div id="flh-widget" data-count="6" data-modality="text"><\/div><\/div>/);
    assert.match(html, /<script src="\.\.\/widget\.js(\?v=[0-9a-f]{8})?" defer><\/script>\s*<script src="\.\.\/embed\.js(\?v=[0-9a-f]{8})?" defer>/);
  });

  test('badges: the verified SVG, and one option and badge per provider', () => {
    const html = read(PAGES.embed);
    assert.ok(existsSync(join(ROOT, 'site/badge-verified.svg')));
    assert.match(html, /<img src="\.\.\/badge-verified\.svg"/);
    for (const p of providers) {
      assert.ok(html.includes(`<option value="${p.slug}"`), `${p.slug}: option`);
      assert.ok(existsSync(join(ROOT, `site/badges/${p.slug}.json`)), `${p.slug}: badge JSON`);
    }
    const groq = providers.find((p) => p.slug === 'groq');
    assert.ok(html.includes(escapeText(providerBadgeMarkdown(groq, SITE))), 'default badge snippet');
    assert.doesNotMatch(html, /<img[^>]+src="https:\/\/img\.shields\.io/, 'no image is loaded from shields.io');
  });

  test('the provider badge as HTML: the name is escaped and the snippet is text, not an image', () => {
    assert.equal(
      providerBadgeHtml({ slug: 'wandb-inference', name: 'W&B "Inference"' }, SITE),
      `<a href="${SITE}/p/wandb-inference"><img src="https://img.shields.io/endpoint?url=${SITE}/badges/wandb-inference.json" alt="W&amp;B &quot;Inference&quot; on Free LLM API Hub" height="20"></a>`,
    );
    const html = read(PAGES.embed);
    const groq = providers.find((p) => p.slug === 'groq');
    assert.ok(html.includes(`<p>Markdown:</p><pre data-snippet="badge"><code id="badge-snippet">${escapeText(providerBadgeMarkdown(groq, SITE))}</code></pre>`), 'Markdown snippet');
    assert.ok(html.includes(`<p>HTML:</p><pre data-snippet="badge"><code id="badge-snippet-html">${escapeText(providerBadgeHtml(groq, SITE))}</code></pre>`), 'HTML snippet');
  });

  test('embed.js rewrites both badge snippets for the picked provider, as the build writes them', () => {
    const source = read('site/embed.js');
    assert.match(source, /getElementById\('badge-snippet-html'\)/);
    assert.doesNotMatch(source, /innerHTML/);
    // Run the real script against a stub page: ?p= picks the provider, then the picker changes it.
    const run = (search, names) => {
      const ids = { 'badge-snippet': { textContent: '' }, 'badge-snippet-html': { textContent: '' } };
      const listeners = {};
      const pick = {
        options: names.map((p) => ({ value: p.slug, textContent: p.name })),
        selectedIndex: 0,
        addEventListener: (type, fn) => { listeners[type] = fn; },
      };
      ids['badge-provider'] = pick;
      const document = { getElementById: (id) => ids[id] || null };
      new Script(source).runInContext(createContext({ document, location: { search } }));
      return { ids, pick, change: () => listeners.change() };
    };
    const wandb = providers.find((p) => p.name.includes('&')) || { slug: 'wandb-inference', name: 'W&B Inference' };
    const groq = providers.find((p) => p.slug === 'groq');
    const page = run(`?p=${wandb.slug}`, [groq, wandb]);
    assert.equal(page.ids['badge-snippet'].textContent, providerBadgeMarkdown(wandb, SITE));
    assert.equal(page.ids['badge-snippet-html'].textContent, providerBadgeHtml(wandb, SITE));
    page.pick.selectedIndex = 0;
    page.change();
    assert.equal(page.ids['badge-snippet'].textContent, providerBadgeMarkdown(groq, SITE));
    assert.equal(page.ids['badge-snippet-html'].textContent, providerBadgeHtml(groq, SITE));
  });

  test('the Cite block is identical on /api/, /quality/ and /embed/ and matches CITATION.cff', () => {
    const r = citationRecord(cff);
    const bib = `<pre data-snippet="citation"><code id="cite-bibtex">${escapeText(bibtex(r))}</code></pre>`;
    const apaHtml = `<pre data-snippet="citation"><code id="cite-apa">${escapeText(apa(r))}</code></pre>`;

    for (const [page, heading] of [
      [PAGES.api, 'Cite this dataset'],
      [PAGES.quality, 'Cite this dataset'],
      [PAGES.embed, 'Cite'],
    ]) {
      const html = read(page);
      assert.ok(html.includes(`<h2 id="cite">${heading}</h2>`), `${page}: Cite heading`);
      assert.ok(html.includes(bib), `${page}: BibTeX`);
      assert.ok(html.includes(apaHtml), `${page}: APA`);
    }
  });

  test('links the data files and the API', () => {
    const html = read(PAGES.embed);
    for (const href of ['../providers.json', '../providers.csv', '../api/', '../api/v1/index.json', '../llms.txt']) assert.ok(html.includes(`href="${href}"`), href);
  });
});
