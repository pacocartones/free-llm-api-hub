// The long-form guides under /guides/ (lib/long-guides.mjs): they are built and listed everywhere a guide is (hub,
// sitemap, llms.txt, OG image), every internal link resolves, the FAQ structured data is the visible text, and every
// list and number on the page is the one the data gives, so the copy cannot outlive the data.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateTree } from './lib/private-tree.mjs';
import { stripTags } from './lib/escape.mjs';
import { figureErrors, providerFigures } from './lib/figures.mjs';
import { LONG_GUIDES, longGuidePage, alternativesSets, noCardNoPhone, productionFigures, NO_FREE_MODEL_CALLS } from './lib/long-guides.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = privateTree(REPO);
const SITE = 'https://freellmapihub.com';
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const page = (slug) => read(`site/guides/${slug}.html`);
// Drop every <script>…</script> block (any case) by scanning, not by regex, so the visible text keeps no
// script content. Our own build output is the input; an unclosed <script> drops the rest of the page.
const withoutScripts = (html) => {
  const lower = html.toLowerCase();
  let out = '';
  let i = 0;
  for (;;) {
    const open = lower.indexOf('<script', i);
    if (open === -1) return out + html.slice(i);
    out += html.slice(i, open);
    const close = lower.indexOf('</script', open);
    if (close === -1) return out;
    const end = lower.indexOf('>', close);
    if (end === -1) return out;
    i = end + 1;
  }
};
const SLUGS = LONG_GUIDES.map((g) => g.slug);

let providers, notFree;
before(() => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'pipe' });
  providers = JSON.parse(read('data/providers.json')).providers;
  notFree = JSON.parse(read('data/not-free.json'));
});

const graphOf = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
// The provider slugs linked from one table, in order (the table that follows the given aria-label).
const tableSlugs = (html, label) => {
  const at = html.indexOf(`aria-label="${label}"`);
  assert.ok(at >= 0, `table "${label}" is on the page`);
  const body = html.slice(at, html.indexOf('</tbody>', at));
  return [...body.matchAll(/<tr><td class="name"><a href="\.\.\/p\/([a-z0-9-]+)">/g)].map((m) => m[1]);
};
const sorted = (a) => [...a].sort();

describe('every long guide', () => {
  test('is built with a self canonical, its title and description, and is in the sitemap, the hub, llms.txt and the OG manifest', () => {
    const sitemap = read('site/sitemap.xml');
    const hub = read('site/guides-and-collections/index.html');
    const llms = read('site/llms.txt');
    const og = JSON.parse(read('site/og/manifest.json'));
    for (const g of LONG_GUIDES) {
      const url = `${SITE}/guides/${g.slug}`;
      const html = page(g.slug);
      const parts = longGuidePage(g, { providers, notFree });
      assert.ok(html.includes(`<link rel="canonical" href="${url}">`), `${g.slug}: canonical`);
      assert.equal(html.match(/<title>([^<]*)<\/title>/)[1], parts.title.replace(/&/g, '&amp;'));
      const desc = html.match(/<meta name="description" content="([^"]*)"/)[1];
      assert.ok(desc.length <= 155, `${g.slug}: description is ${desc.length} characters`);
      assert.equal(desc, parts.metaDesc, `${g.slug}: the description is the guide's own, not cut`);
      assert.doesNotMatch(html, /\{n\}/);
      assert.equal(sitemap.split(`<loc>${url}</loc>`).length - 1, 1, `${g.slug}: one sitemap entry`);
      assert.ok(hub.includes(`href="../guides/${g.slug}"`), `${g.slug}: on the hub`);
      assert.ok(llms.includes(`(${url})`), `${g.slug}: in llms.txt`);
      assert.ok(og[`guides/${g.slug}.png`], `${g.slug}: OG fingerprint`);
      assert.ok(existsSync(join(ROOT, `site/og/guides/${g.slug}.png`)), `${g.slug}: OG image`);
      assert.ok(html.includes(`<meta property="og:image" content="${SITE}/og/guides/${g.slug}.png">`), `${g.slug}: og:image`);
      assert.doesNotMatch(html, /<meta name="robots" content="noindex/);
    }
  });

  test('declares Article, BreadcrumbList and FAQPage, and each FAQ answer is the visible text', () => {
    for (const slug of SLUGS) {
      const html = page(slug);
      const graph = graphOf(html);
      for (const t of ['Article', 'BreadcrumbList', 'FAQPage']) assert.ok(graph.some((n) => n['@type'] === t), `${slug}: ${t}`);
      assert.doesNotMatch(JSON.stringify(graph), /"@type":"(Product|Offer|AggregateRating)"/);
      const crumbs = graph.find((n) => n['@type'] === 'BreadcrumbList').itemListElement;
      assert.equal(crumbs[2].item, `${SITE}/guides/${slug}`);
      const visible = stripTags(withoutScripts(html)).replace(/\s+/g, ' ');
      const faq = graph.find((n) => n['@type'] === 'FAQPage').mainEntity;
      assert.ok(faq.length >= 3, `${slug}: at least three questions`);
      for (const q of faq) {
        assert.ok(visible.includes(q.name), `${slug}: question "${q.name}" is on the page`);
        assert.ok(visible.includes(q.acceptedAnswer.text.replace(/\s+/g, ' ')), `${slug}: answer to "${q.name}" is the visible text`);
      }
    }
  });

  test('every internal link resolves to a built page', () => {
    for (const slug of SLUGS) {
      const html = page(slug);
      for (const [, href] of html.matchAll(/<a [^>]*href="([^"#]+)(?:#[^"]*)?"/g)) {
        if (/^(https?:|mailto:)/.test(href)) continue;
        const path = href.split('?')[0];
        const target = resolve(join(ROOT, 'site/guides'), path);
        const candidates = [target, `${target}.html`, join(target, 'index.html')];
        assert.ok(candidates.some((c) => existsSync(c) && statSync(c).isFile()), `${slug}: ${href} has no page`);
      }
    }
  });

  test('states no dataset count that disagrees with the data, and lists no unverified provider', () => {
    const figs = providerFigures(providers);
    const unverified = providers.filter((p) => !p.verified).map((p) => p.slug);
    for (const slug of SLUGS) {
      const html = page(slug);
      assert.deepEqual(figureErrors(stripTags(html), figs, slug), []);
      for (const u of unverified) assert.ok(!html.includes(`<td class="name"><a href="../p/${u}">`), `${slug}: ${u} is unverified but in a table`);
    }
  });

  test('links to /not-free/', () => {
    for (const slug of SLUGS) assert.ok(page(slug).includes('href="../not-free/"'), slug);
  });
});

describe('the lists are the data', () => {
  test('OpenAI alternatives: every table is the verified OpenAI-compatible set for its use', () => {
    const html = page('openai-api-alternatives');
    const s = alternativesSets(providers);
    const compat = providers.filter((p) => p.verified === true && p.openai_compatible === true);
    const usable = compat.filter((p) => !NO_FREE_MODEL_CALLS.includes(p.slug));
    const has = (m) => (p) => (p.modalities || []).includes(m);
    const chat = usable.filter((p) => p.is_text_llm === true);
    assert.deepEqual(sorted(tableSlugs(html, 'Ongoing free chat APIs that are OpenAI-compatible')), sorted(chat.filter((p) => p.category === 'ongoing').map((p) => p.slug)));
    assert.deepEqual(sorted(tableSlugs(html, 'OpenAI-compatible chat APIs with one-time trial credits')), sorted(chat.filter((p) => p.category === 'trial').map((p) => p.slug)));
    assert.deepEqual(sorted(tableSlugs(html, 'OpenAI-compatible free embeddings APIs')), sorted(usable.filter(has('embeddings')).map((p) => p.slug)));
    assert.deepEqual(sorted(tableSlugs(html, 'OpenAI-compatible free speech APIs')), sorted(usable.filter(has('audio')).map((p) => p.slug)));
    assert.deepEqual(sorted(tableSlugs(html, 'OpenAI-compatible free vision APIs')), sorted(usable.filter(has('vision')).map((p) => p.slug)));
    assert.equal(s.compat.length, compat.length);
    const answer = stripTags(html.match(/<p class="answer"><strong>([\s\S]*?)<\/strong><\/p>/)[1]);
    assert.ok(answer.includes(`${compat.length} of the ${providers.filter((p) => p.verified).length} verified providers`), answer);
    // Each base URL shown is the provider's own.
    for (const p of usable.filter((x) => x.is_text_llm && x.openai_base_url)) assert.ok(html.includes(`<code>${p.openai_base_url.replace(/&/g, "&amp;").replace(/\//g, "/<wbr>")}</code>`), p.slug);
    // The not-free names come from data/not-free.json.
    for (const e of notFree.entries.filter((x) => x.group !== 'removed')) assert.ok(html.includes(e.name.replace(/&/g, '&amp;')), e.name);
  });

  test('OpenAI alternatives: the code examples use a listed provider’s base URL, key variable and free model', () => {
    const html = page('openai-api-alternatives');
    const code = [...html.matchAll(/<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g)].map((m) => ({ lang: m[1], src: m[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&') }));
    const py = code.find((c) => c.lang === 'python');
    const p = providers.find((x) => x.openai_base_url && py.src.includes(`"${x.openai_base_url}"`));
    assert.ok(p, 'the Python example uses a provider base URL');
    assert.ok(py.src.includes(p.env_key), 'its key variable');
    assert.ok((p.models_free || []).some((m) => py.src.includes(`"${m}"`)), 'one of its free models');
    assert.ok(p.verified && p.card_required === false && p.category === 'ongoing');
  });

  test('No card, no phone: the table, the count in the title and the catches are the data', () => {
    const html = page('free-llm-api-no-credit-card-no-phone');
    const list = providers.filter((p) => p.verified === true && p.card_required === false && p.phone_required === false);
    assert.deepEqual(sorted(tableSlugs(html, 'Free APIs with no card and no phone')), sorted(list.map((p) => p.slug)));
    assert.deepEqual(noCardNoPhone(providers).map((p) => p.slug).sort(), sorted(list.map((p) => p.slug)));
    assert.ok(html.includes(`<title>Free AI APIs With No Credit Card and No Phone Number (${list.length}, Checked)</title>`));
    assert.ok(html.match(/<meta name="description" content="The (\d+) /)[1] === String(list.length));
    for (const p of list) assert.ok(html.includes(`<a href="../p/${p.slug}">`) && html.includes(`<time datetime="${p.last_verified}">`), p.slug);
    const unknownPhone = providers.filter((p) => p.verified && p.card_required === false && p.phone_required == null).length;
    assert.ok(html.includes(`No card, phone not confirmed: ${unknownPhone} more`));
    for (const p of providers.filter((x) => x.anonymous_access)) assert.ok(html.includes(`<a href="../p/${p.slug}">`), `${p.slug}: no-account section`);
  });

  test('Production checklist: every count is the data', () => {
    const html = page('choose-free-llm-api-for-production');
    const F = productionFigures(providers);
    const text = stripTags(html).replace(/\s+/g, ' ');
    const at = html.indexOf('aria-label="Commercial use on the free tier"');
    const rows = [...html.slice(at, html.indexOf('</tbody>', at)).matchAll(/<tr><td class="name"><code>([^<]+)<\/code><\/td><td>(\d+)<\/td>/g)].map((m) => [m[1].replace(/&quot;/g, '"'), Number(m[2])]);
    assert.deepEqual(rows, [['true', F.commercial.true], ['false', F.commercial.false], ['"conditional"', F.commercial.conditional], ['null', F.commercial.null]]);
    assert.equal(F.commercial.true + F.commercial.false + F.commercial.conditional + F.commercial.null, F.verified);
    assert.ok(text.includes(`Only ${F.shortlist.length} of ${F.verified} verified providers`));
    for (const p of F.shortlist) assert.ok(html.includes(`<a href="../p/${p.slug}">`), p.slug);
    assert.ok(text.includes(`${F.phoneUnknown} of ${F.total} providers don’t state it`));
    assert.ok(text.includes(`${F.dataPolicy} providers have a quoted data_policy`));
    assert.ok(text.includes(`${F.trainsFalse.length} say they don’t train`) && text.includes(`${F.trainsTrue.length} say they do`) && text.includes(`${F.trainsNull.length} are unsettled`));
    assert.ok(text.includes(`Ongoing tiers renew (daily or monthly): ${F.ongoing} providers. Trials are one-time: ${F.trial}.`));
    assert.ok(text.includes(`exist for ${F.freeLimits} providers`));
  });
});

describe('the copy follows the data', () => {
  // A fixture change to the data must change the page: nothing on it is a typed number or a typed list.
  test('removing a provider and flipping a flag changes the counts and the lists', () => {
    const base = Object.fromEntries(LONG_GUIDES.map((g) => [g.slug, longGuidePage(g, { providers, notFree })]));
    const changed = providers
      .filter((p) => p.slug !== 'zai-glm')
      .map((p) => (p.slug === 'jina-ai' ? { ...p, phone_required: null, commercial_ok: false } : p));
    const next = Object.fromEntries(LONG_GUIDES.map((g) => [g.slug, longGuidePage(g, { providers: changed, notFree })]));
    const nc = 'free-llm-api-no-credit-card-no-phone';
    assert.equal(next[nc].count, base[nc].count - 2);
    assert.ok(next[nc].title.includes(`(${base[nc].count - 2}, Checked)`));
    assert.ok(!next[nc].body.includes('../p/zai-glm"') && !next[nc].body.includes('<td class="name"><a href="../p/jina-ai">'));
    const alt = 'openai-api-alternatives';
    assert.equal(next[alt].count, base[alt].count - 1);
    assert.ok(!next[alt].body.includes('../p/zai-glm"'));
    const pr = 'choose-free-llm-api-for-production';
    assert.notEqual(next[pr].body, base[pr].body);
    assert.ok(!next[pr].body.includes('../p/zai-glm"'));
  });

  test('the guides fail loudly without the OpenAI entry in data/not-free.json', () => {
    const g = LONG_GUIDES.find((x) => x.slug === 'openai-api-alternatives');
    const without = { ...notFree, entries: notFree.entries.filter((e) => e.id !== 'openai') };
    assert.throws(() => longGuidePage(g, { providers, notFree: without }), /openai/);
  });
});
