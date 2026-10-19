// The converter of lib/markdown.mjs, and the two pages it writes (/methodology/ and /contributing/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { privateTree } from './lib/private-tree.mjs';
import { markdownToHtml, resolveLink, headingId } from './lib/markdown.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'https://github.com/pacocartones/free-llm-api-hub';
const ctx = { repo: REPO, site: 'https://freellmapihub.com', pages: { 'CONTRIBUTING.md': '/contributing/', 'docs/methodology.md': '/methodology/' }, from: 'CONTRIBUTING.md' };
const md = (s, c = ctx) => markdownToHtml(s, c);

test('nothing of the source is passed through as HTML', () => {
  // Mutant: pass a raw line through, and every one of these would reach the page.
  for (const bad of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<a href="javascript:alert(1)">x</a>', '"><svg onload=alert(1)>']) {
    const h = md(`text ${bad} more\n\n${bad}\n\n- ${bad}\n\n> ${bad}\n\n| ${bad} |\n|---|\n| ${bad} |\n\n# ${bad}\n\n\`\`\`\n${bad}\n\`\`\``);
    assert.doesNotMatch(h, /<script|<img|<svg|<a href="javascript/, bad); // the words onerror= and onload= may stay: they are text, not an attribute of a tag
    assert.ok(h.includes('&lt;'), 'the angle brackets are written as text');
  }
});

test('links: https stay, repository paths become GitHub URLs, pages of the site stay on the site, the rest is text', () => {
  const link = (u, from = 'CONTRIBUTING.md') => resolveLink(u, { ...ctx, from });
  assert.deepEqual(link('https://example.com/a?b=1'), { href: 'https://example.com/a?b=1', external: true });
  assert.deepEqual(link('https://freellmapihub.com/best/'), { href: 'https://freellmapihub.com/best/', external: false });
  assert.deepEqual(link('docs/architecture.md'), { href: `${REPO}/blob/main/docs/architecture.md`, external: true });
  assert.deepEqual(link('README.md#contributors'), { href: `${REPO}/blob/main/README.md#contributors`, external: true });
  assert.deepEqual(link('../../issues/new?template=inaccuracy.yml'), { href: `${REPO}/issues/new?template=inaccuracy.yml`, external: true });
  assert.deepEqual(link('docs/methodology.md'), { href: '/methodology/', external: false }, 'a file with a page goes to the page');
  assert.deepEqual(link('../CONTRIBUTING.md', 'docs/methodology.md'), { href: '/contributing/', external: false });
  assert.deepEqual(link('update-playbook.md', 'docs/methodology.md'), { href: `${REPO}/blob/main/docs/update-playbook.md`, external: true }, 'relative to the document');
  assert.deepEqual(link('#quick-start'), { href: '#quick-start', external: false });
  for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'mailto:a@b.c', '//evil.example/x', '#a b', '../../../etc/passwd', '']) assert.equal(link(bad), null, bad);
  assert.equal(md('[x](javascript:alert(1))'), '<p>x</p>', 'the text stays, the link goes');
});

test('the blocks: headings with GitHub ids (each id once), lists nested, numbered, quotes, tables, code, rules, emphasis', () => {
  assert.equal(headingId('The ⚠️ (unverified) state'), 'the--unverified-state');
  assert.equal(headingId('Quick start'), 'quick-start');
  const h = md('# A\n\n## Same\n\n## Same\n\ntext **bold** and *em* and `co*de` and \\*not\\* and a_b_c\n\n- one\n  - nested\n- two\n\n1. first\n2. second\n\n> quoted\n> more\n\n---\n\n| h1 | h2 |\n|----|----|\n| a | b \\| c |\n\n```js\nconst x = "<b>";\n```');
  assert.match(h, /<h1 id="a">A<\/h1>/);
  assert.match(h, /<h2 id="same">Same<\/h2>\n<h2 id="same-1">Same<\/h2>/);
  assert.match(h, /<strong>bold<\/strong> and <em>em<\/em> and <code>co\*de<\/code> and \*not\* and a_b_c/);
  assert.match(h, /<ul><li>one<ul><li>nested<\/li><\/ul><\/li><li>two<\/li><\/ul>/);
  assert.match(h, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
  assert.match(h, /<blockquote><p>quoted more<\/p><\/blockquote>/);
  assert.match(h, /<hr>/);
  assert.match(h, /<table class="model-table"><thead><tr><th>h1<\/th><th>h2<\/th><\/tr><\/thead><tbody><tr><td>a<\/td><td>b \| c<\/td><\/tr><\/tbody><\/table>/);
  assert.match(h, /<pre><code>const x = &quot;&lt;b&gt;&quot;;<\/code><\/pre>/);
});

test('/methodology/ and /contributing/: linked from the footer, in the sitemap, titled and described, and they say what the files say', () => {
  const out = privateTree(ROOT);
  execFileSync(process.execPath, [join(out, 'scripts/build.mjs')], { cwd: out, stdio: 'pipe' });
  const read = (rel) => readFileSync(join(out, rel), 'utf8');
  const sitemap = read('site/sitemap.xml');
  const home = read('site/index.html');
  for (const [slug, file] of [['methodology', 'docs/methodology.md'], ['contributing', 'CONTRIBUTING.md']]) {
    // Mutant: link the footer back to GitHub, or take the page out of the sitemap, and these go red.
    assert.match(home, new RegExp(`<a href="methodology/">Methodology</a>|<a href="contributing/">Contributing</a>`));
    assert.doesNotMatch(home, /blob\/main\/docs\/methodology\.md">Methodology|blob\/main\/CONTRIBUTING\.md">Contributing/);
    assert.ok(sitemap.includes(`<loc>https://freellmapihub.com/${slug}/</loc>`), `${slug} is in the sitemap`);
    const page = read(`site/${slug}/index.html`);
    const title = page.match(/<title>([^<]+)<\/title>/)[1];
    const desc = page.match(/<meta name="description" content="([^"]+)"/)[1];
    assert.ok(title.length > 10 && title.length <= 70, `${slug}: title ${title.length}`);
    assert.ok(desc.length >= 70 && desc.length <= 155, `${slug}: description ${desc.length}`);
    assert.ok(page.includes(`<link rel="canonical" href="https://freellmapihub.com/${slug}/">`), `${slug}: canonical`);
    // It says what the file says: every heading of the file is a heading of the page, and no marker of the source is left.
    const src = readFileSync(join(ROOT, file), 'utf8');
    const main = page.slice(page.indexOf('<main id="main">'));
    const decode = (t) => t.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const onPage = new Set([...main.matchAll(/<h[2-3] id="[^"]*">(.*?)<\/h[2-3]>/g)].map((m) => decode(m[1])));
    for (const m of src.matchAll(/^#{2,3}\s+(.*?)\s*$/gm)) {
      assert.ok(onPage.has(m[1].replace(/[`*]/g, '')), `${slug}: the heading "${m[1]}" is on the page`);
    }
    assert.doesNotMatch(main.replace(/<pre>[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>/g, ''), /\*\*|^#{1,6} |\]\(/m, `${slug}: no markdown left over`);
    // Every link of the page is https, a path of the site or an anchor that exists; none opens a script.
    const ids = new Set([...main.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    for (const m of main.matchAll(/<a href="([^"]*)"/g)) {
      const href = m[1].replace(/&amp;/g, '&');
      if (href.startsWith('#')) assert.ok(ids.has(href.slice(1)), `${slug}: the anchor ${href} exists`);
      else assert.match(href, /^(https:\/\/|\.\.\/|\/)/, `${slug}: ${href}`);
    }
    assert.equal((main.match(/<pre><code>/g) || []).length, Math.floor((src.match(/^```/gm) || []).length / 2), `${slug}: one block of code for each fenced block`);
  }
  assert.match(read('site/methodology/index.html'), /<table class="model-table">/, 'the table of the methodology is a table');
});
