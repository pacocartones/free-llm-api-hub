// llms.txt (the llmstxt.org index for answer engines and agents) and the Markdown version of every provider page,
// /p/<slug>.md (lib/provider-markdown.mjs): the index follows the convention (H1, a blockquote, the dataset date and
// count, H2 sections of links), names the key pages and every provider, and every link on it resolves to a built
// file; each active provider has one .md whose content is its record; the .md files are alternates, not in the sitemap.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateTree } from './lib/private-tree.mjs';
import { datasetAsOf } from './lib/release-stamp.mjs';
import { COLLECTIONS } from './lib/collections.mjs';
import {
  FREE_TYPE_WORDS, mdText, mdUrl, mdCode, mdFence, flagWords, providerMarkdown, llmsProviderLine, oneLineLimits, quickstartModel,
} from './lib/provider-markdown.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = privateTree(REPO);
const SITE = 'https://freellmapihub.com';
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

let data, providers, asOf, llms;
before(() => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'pipe' });
  data = JSON.parse(read('data/providers.json'));
  providers = data.providers;
  asOf = datasetAsOf(data);
  llms = read('site/llms.txt');
});

// The built file a site URL is served from on GitHub Pages: a directory URL serves index.html, a URL with an extension
// serves that file, and an extensionless URL serves <path>.html (or <path>/index.html).
function servedFile(url) {
  const path = decodeURIComponent(new URL(url).pathname);
  if (path.endsWith('/')) return [`site${path}index.html`];
  if (/\.[a-z0-9]+$/i.test(path)) return [`site${path}`];
  return [`site${path}.html`, `site${path}/index.html`];
}
const links = (text) => [...text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]);

describe('llms.txt', () => {
  test('follows the llmstxt.org layout: H1, blockquote summary, the date and count before the first section, H2 sections of links', () => {
    const lines = llms.split('\n');
    assert.equal(lines[0], '# Free LLM API Hub');
    assert.equal(lines.filter((l) => /^# /.test(l)).length, 1, 'one H1');
    assert.match(lines[2], /^> \S/, 'a blockquote summary right after the title');
    const intro = llms.slice(0, llms.indexOf('\n## '));
    assert.ok(intro.includes(`Data of ${asOf}`), 'the dataset date is at the top');
    assert.ok(intro.includes(`${providers.length} providers`), 'the provider count is at the top');
    assert.ok(intro.includes(`v${data.version}`));
    // Below the intro, every non-empty line is an H2 heading or a list item that starts with a link.
    for (const l of llms.slice(intro.length).split('\n').filter(Boolean)) {
      assert.match(l, /^(## \S.*|- \[[^\]]+\]\(https:\/\/[^)\s]+\)(: .+| \(.+\))?)$/, `not a heading or a link item: ${l}`);
    }
    const h2 = lines.filter((l) => l.startsWith('## ')).map((l) => l.slice(3));
    for (const s of ['Start here', 'Dataset', 'Guides', 'Collections', 'Providers']) assert.ok(h2.includes(s), `section ${s}`);
    assert.equal(new Set(h2).size, h2.length, 'no section twice');
    assert.ok(llms.endsWith('\n') && !llms.endsWith('\n\n'));
  });

  test('links the key pages, every guide and every collection', () => {
    const urls = new Set(links(llms));
    for (const p of ['/find/', '/guides-and-collections/', '/not-free/', '/compare/', '/api/', '/quality/', '/embed/', '/llms-full.txt', '/api/v1/providers.json']) {
      assert.ok(urls.has(`${SITE}${p}`), `links ${p}`);
    }
    for (const c of COLLECTIONS) assert.ok(urls.has(`${SITE}/collections/${c.slug}`), `collection ${c.slug}`);
    const guides = readdirSync(join(ROOT, 'site/guides')).filter((n) => n.endsWith('.html') && n !== 'index.html').map((n) => n.slice(0, -5));
    assert.ok(guides.length > 5);
    for (const g of guides) assert.ok(urls.has(`${SITE}/guides/${g}`), `guide ${g}`);
  });

  test('has one line per provider, in dataset order: name, free type, one-line limits, its page and its Markdown version', () => {
    const section = llms.slice(llms.indexOf('\n## Providers\n') + '\n## Providers\n'.length).split('\n').filter(Boolean);
    assert.equal(section.length, providers.length);
    providers.forEach((p, i) => {
      const line = section[i];
      assert.equal(line, llmsProviderLine(p, { site: SITE }));
      assert.ok(line.startsWith(`- [${mdText(p.name)}](${SITE}/p/${p.slug}): ${FREE_TYPE_WORDS[p.free_type]}; `), line);
      assert.ok(line.includes(`(${SITE}/p/${p.slug}.md)`), `${p.slug}: links its Markdown version`);
      assert.ok(!oneLineLimits(p).includes('\n'));
    });
  });

  test('every link to the site resolves to a built file', () => {
    const site = links(llms).filter((u) => u.startsWith(`${SITE}/`));
    assert.ok(site.length > providers.length * 2);
    for (const u of site) assert.ok(servedFile(u).some((f) => existsSync(join(ROOT, f))), `${u} is not built`);
  });

  test('llms-full.txt keeps its layout and carries the dataset date in its header', () => {
    const full = read('site/llms-full.txt');
    const header = full.slice(0, full.indexOf('\n## '));
    assert.match(header, /^# Free LLM API Hub — full provider list\n\n> /);
    assert.ok(header.includes(`Data of ${asOf}`));
    assert.ok(header.includes(`${providers.length} providers`));
    assert.equal((full.match(/^### /gm) || []).length, providers.length);
  });
});

describe('/p/<slug>.md', () => {
  test('one Markdown file per active provider, next to its HTML page, and nothing else', () => {
    const files = readdirSync(join(ROOT, 'site/p'));
    const md = files.filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3)).sort();
    assert.deepEqual(md, providers.map((p) => p.slug).sort());
    for (const slug of md) assert.ok(files.includes(`${slug}.html`), `${slug}.html sits next to ${slug}.md`);
  });

  test('is the record: the title, the "is it free" answer, the limits, the flags with sources and dates, the quickstart and the links', () => {
    for (const p of providers) {
      const md = read(`site/p/${p.slug}.md`);
      assert.equal(md, providerMarkdown(p, { site: SITE, asOf, version: data.version }), `${p.slug}: built from the record`);
      assert.ok(md.startsWith(`# ${mdText(p.name)}: free tier and limits\n\n> `), `${p.slug}: title`);
      assert.ok(md.includes(`Data of ${asOf}`), `${p.slug}: dataset date`);
      assert.ok(md.includes(`Canonical page: ${SITE}/p/${p.slug}\n`), `${p.slug}: names the HTML page as canonical`);
      assert.ok(md.includes(`## Is ${mdText(p.name)} free?\n\n`), `${p.slug}: the question`);
      assert.ok(md.includes(mdText(p.free_tier)), `${p.slug}: what is free`);
      if (p.verified === true) assert.ok(md.includes(`on ${p.last_verified}.`), `${p.slug}: verified date`);
      else assert.ok(md.includes('Not verified yet'), `${p.slug}: says it is not verified`);
      const fl = p.free_limits;
      if (fl && mdUrl(fl.source)) {
        for (const k of ['requests_per_minute', 'requests_per_day', 'tokens_per_day', 'tokens_per_month']) {
          if (Number.isInteger(fl[k])) assert.ok(md.includes(`- ${fl[k].toLocaleString('en-US')} `), `${p.slug}: ${k}`);
        }
        assert.ok(md.includes(`(${fl.source}), read ${fl.checked}.`), `${p.slug}: limits source and date`);
      }
      if (p.rate_limits) assert.ok(md.includes(mdText(p.rate_limits)), `${p.slug}: the provider's words`);
      for (const [field, c] of Object.entries(p.field_checks || {})) {
        assert.ok(md.includes(`checked ${c.checked}.`), `${p.slug}.${field}: check date`);
        for (const s of c.sources || []) assert.ok(md.includes(`(${s})`), `${p.slug}.${field}: source ${s}`);
      }
      for (const [field, label] of [['card_required', 'Credit card'], ['phone_required', 'Phone verification'], ['commercial_ok', 'Commercial use']]) {
        const line = md.split('\n').find((l) => l.startsWith(`- **${label}:** `));
        assert.ok(line, `${p.slug}: ${label} line`);
        if (p[field] == null) assert.match(line, /^- \*\*[^*]+:\*\* not stated/, `${p.slug}: a null ${field} reads not stated, never no`);
      }
      if (p.openai_base_url) {
        assert.ok(md.includes('```python\n'), `${p.slug}: python quickstart`);
        assert.ok(md.includes(JSON.stringify(p.openai_base_url)), `${p.slug}: quickstart uses the base URL`);
        assert.ok(md.includes(JSON.stringify(quickstartModel(p))), `${p.slug}: quickstart uses a free model`);
      } else assert.ok(md.includes('No OpenAI-compatible base URL is recorded'), `${p.slug}: says there is no quickstart`);
      assert.ok(md.includes(`- [Provider page (HTML, canonical)](${SITE}/p/${p.slug})`));
      if (mdUrl(p.docs_url)) assert.ok(md.includes(`[Official docs](${p.docs_url})`), `${p.slug}: docs link`);
      if (mdUrl(p.keys_url)) assert.ok(md.includes(`[Get a free key](${p.keys_url})`), `${p.slug}: key link`);
      assert.doesNotMatch(md.replace(/^(`{3,})[^\n]*\n[\s\S]*?^\1$/gm, ''), /<(script|a|div|span)\b/i, `${p.slug}: no raw HTML outside code`);
    }
  });

  test('stays out of sitemap.xml, which lists the canonical HTML page', () => {
    const sitemap = read('site/sitemap.xml');
    assert.doesNotMatch(sitemap, /\.md</);
    for (const p of providers) assert.ok(sitemap.includes(`<loc>${SITE}/p/${p.slug}</loc>`), `${p.slug}: HTML page in the sitemap`);
  });

  test('the HTML page keeps its own canonical, so the two URLs never collide', () => {
    for (const p of providers) {
      assert.ok(read(`site/p/${p.slug}.html`).includes(`<link rel="canonical" href="${SITE}/p/${p.slug}">`), p.slug);
    }
  });

  test('is published as a static file: the Pages deploy uploads site/ without a Jekyll build, so .md is served as text', () => {
    const wf = readFileSync(join(REPO, '.github/workflows/pages.yml'), 'utf8');
    assert.match(wf, /actions\/upload-pages-artifact@/);
    assert.match(wf, /actions\/deploy-pages@/);
    assert.doesNotMatch(wf, /jekyll/i, 'no Jekyll step that would turn .md into HTML');
  });
});

describe('provider-markdown helpers', () => {
  test('mdText flattens and escapes Markdown syntax from community-edited fields', () => {
    assert.equal(mdText(' a\n b '), 'a b');
    assert.equal(mdText('[x](javascript:alert(1)) <b>*y*</b> `z`'), '\\[x\\](javascript:alert(1)) \\<b\\>\\*y\\*\\</b\\> \\`z\\`');
  });

  test('mdUrl keeps only plain https URLs', () => {
    assert.equal(mdUrl('https://example.com/a'), 'https://example.com/a');
    for (const bad of ['http://example.com', 'javascript:alert(1)', 'https://e.com/a)b', 'https://e.com/ a', null]) assert.equal(mdUrl(bad), '', String(bad));
  });

  test('code spans and fences survive backticks in the value', () => {
    assert.equal(mdCode('a'), '`a`');
    assert.equal(mdCode('a`b'), '`` a`b ``');
    assert.equal(mdFence('bash', 'echo ```\n'), '````bash\necho ```\n````');
  });

  test('a null flag reads not stated with its reason, never no', () => {
    assert.equal(flagWords(false, 'required', 'not required'), 'not required');
    assert.equal(flagWords(true, 'required', 'not required'), 'required');
    assert.equal(flagWords('conditional', 'allowed', 'not allowed'), 'conditional');
    assert.equal(flagWords(null, 'required', 'not required'), 'not stated');
    assert.equal(flagWords(null, 'required', 'not required', { status: 'needs_account' }), 'not stated: needs an account to check');
  });

  test('every free_type in the data has words', () => {
    const d = JSON.parse(readFileSync(join(REPO, 'data/providers.json'), 'utf8'));
    for (const p of d.providers) assert.ok(FREE_TYPE_WORDS[p.free_type], `${p.slug}: ${p.free_type}`);
  });
});
