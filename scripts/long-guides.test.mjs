// The long-form guides under /guides/ (lib/long-guides.mjs), including the modality and use-case guides: they are built and
// listed everywhere a guide is (hub,
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
import {
  LONG_GUIDES, longGuidePage, alternativesSets, noCardNoPhone, productionFigures, NO_FREE_MODEL_CALLS,
  modalitySets, speechMentions, dataUseWords, embeddingModel, embeddingsQuickstartProvider, watermarkSentences, MENTIONS_IMAGE_GENERATION,
  textLlms, codingSets, topSpeed, ragSets, ragStack, agentSets, AGENT_WORDS, chatbotSets, chatbotPasses, CHATBOT_CHECKS, studentSets,
} from './lib/long-guides.mjs';
import { parseHash, constraintState } from './lib/find.mjs';

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
    assert.ok(text.includes(`${F.phoneUnknown} of ${F.verified} verified providers don’t state it`));
    assert.ok(text.includes(`${F.dataPolicy} of the ${F.verified} verified providers have a quoted data_policy`));
    assert.ok(text.includes(`${F.trainsFalse.length} say they don’t train`) && text.includes(`${F.trainsTrue.length} say they do`) && text.includes(`${F.trainsNull.length} are unsettled`));
    assert.ok(text.includes(`Ongoing tiers renew (daily or monthly): ${F.ongoing} providers. Trials are one-time: ${F.trial}.`));
    assert.ok(text.includes(`exist for ${F.freeLimits} of the ${F.verified} verified providers`));
  });
});

describe('the copy follows the data', () => {
  // A fixture change to the data must change the page: nothing on it is a typed number or a typed list.
  test('removing a provider and flipping a flag changes the counts and the lists', () => {
    const base = Object.fromEntries(LONG_GUIDES.map((g) => [g.slug, longGuidePage(g, { providers, notFree })]));
    const changed = providers
      .filter((p) => p.slug !== 'ovhcloud-ai-endpoints')
      .map((p) => (p.slug === 'mixedbread' ? { ...p, phone_required: null, commercial_ok: false } : p));
    const next = Object.fromEntries(LONG_GUIDES.map((g) => [g.slug, longGuidePage(g, { providers: changed, notFree })]));
    const nc = 'free-llm-api-no-credit-card-no-phone';
    assert.equal(next[nc].count, base[nc].count - 2);
    assert.ok(next[nc].title.includes(`(${base[nc].count - 2}, Checked)`));
    assert.ok(!next[nc].body.includes('../p/ovhcloud-ai-endpoints"') && !next[nc].body.includes('<td class="name"><a href="../p/mixedbread">'));
    const alt = 'openai-api-alternatives';
    assert.equal(next[alt].count, base[alt].count - 1);
    assert.ok(!next[alt].body.includes('../p/ovhcloud-ai-endpoints"'));
    const pr = 'choose-free-llm-api-for-production';
    assert.notEqual(next[pr].body, base[pr].body);
    assert.ok(!next[pr].body.includes('../p/ovhcloud-ai-endpoints"'));
  });

  test('the guides fail loudly without the OpenAI entry in data/not-free.json', () => {
    const g = LONG_GUIDES.find((x) => x.slug === 'openai-api-alternatives');
    const without = { ...notFree, entries: notFree.entries.filter((e) => e.id !== 'openai') };
    assert.throws(() => longGuidePage(g, { providers, notFree: without }), /openai/);
  });
});

// ---------- the modality guides: embeddings, speech, OCR, image generation ----------
const MODALITY = [
  { slug: 'free-embeddings-apis', modality: 'embeddings', label: 'Free embedding APIs compared' },
  { slug: 'free-speech-to-text-apis', modality: 'audio', label: 'Free speech-to-text and text-to-speech APIs compared' },
  { slug: 'free-ocr-document-ai-apis', modality: 'ocr', label: 'Free OCR and document-parsing APIs compared' },
];
const textOf = (html) => stripTags(withoutScripts(html)).replace(/\s+/g, ' ');
const answerOf = (html) => stripTags(html.match(/<p class="answer"><strong>([\s\S]*?)<\/strong><\/p>/)[1]).replace(/\s+/g, ' ');
const faqOf = (html) => graphOf(html).find((n) => n['@type'] === 'FAQPage').mainEntity;
// The cells of one table's rows, keyed by provider slug.
const tableRows = (html, label) => {
  const at = html.indexOf(`aria-label="${label}"`);
  assert.ok(at >= 0, `table "${label}" is on the page`);
  const body = html.slice(at, html.indexOf('</tbody>', at));
  return new Map([...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].slice(1).map((m) => {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
    return [cells[0].match(/\.\.\/p\/([a-z0-9-]+)/)[1], cells];
  }));
};

describe('the modality guides', () => {
  test('each table is every verified provider with that modality, except the entries with no free model calls', () => {
    const verified = providers.filter((p) => p.verified === true);
    for (const g of MODALITY) {
      const html = page(g.slug);
      const want = verified.filter((p) => (p.modalities || []).includes(g.modality) && !NO_FREE_MODEL_CALLS.includes(p.slug));
      assert.deepEqual(sorted(tableSlugs(html, g.label)), sorted(want.map((p) => p.slug)), g.slug);
      // An entry left out for giving no free model calls is named, with its own sentence.
      for (const p of verified.filter((x) => (x.modalities || []).includes(g.modality) && NO_FREE_MODEL_CALLS.includes(x.slug))) {
        assert.ok(html.includes(`<a href="../p/${p.slug}">`), `${g.slug}: ${p.slug} is named`);
      }
      const parts = longGuidePage(LONG_GUIDES.find((x) => x.slug === g.slug), { providers, notFree });
      assert.equal(parts.count, want.length);
      assert.ok(parts.title.includes(`(${want.length}, Checked)`), parts.title);
      assert.match(parts.metaDesc, new RegExp(`(^|The )${want.length} free `));
      const answer = answerOf(html);
      assert.ok(answer.startsWith(`${want.length} of the ${verified.length} verified providers`), answer);
    }
  });

  test('image generation: the two tables split the image modality by the entry’s own words, and the title counts the first', () => {
    const html = page('free-image-generation-apis');
    const image = providers.filter((p) => p.verified === true && (p.modalities || []).includes('image') && !NO_FREE_MODEL_CALLS.includes(p.slug));
    const words = (p) => [p.free_tier, p.rate_limits, p.notes, p.best_for, ...(p.models_free || [])].filter(Boolean).join(' ');
    const gen = image.filter((p) => MENTIONS_IMAGE_GENERATION.test(words(p)));
    const other = image.filter((p) => !gen.includes(p));
    assert.deepEqual(sorted(tableSlugs(html, 'Free image generation APIs compared')), sorted(gen.map((p) => p.slug)));
    assert.deepEqual(sorted(tableSlugs(html, 'Other free image APIs')), sorted(other.map((p) => p.slug)));
    assert.ok(gen.length > 0, 'some entries name image generation');
    const s = modalitySets(providers);
    assert.equal(s.imageGeneration.length + s.imageOther.length, image.length);
    assert.ok(html.includes(`<title>Free Image Generation APIs (${gen.length}, Checked): Limits and Terms</title>`));
    assert.ok(answerOf(html).startsWith(`${gen.length} of the `) && answerOf(html).includes(`${other.length} more list the image modality`));
  });

  test('every row’s card, phone, commercial and data-use cells and its check date are the entry’s', () => {
    const tables = [...MODALITY, { slug: 'free-image-generation-apis', label: 'Free image generation APIs compared' }, { slug: 'free-image-generation-apis', label: 'Other free image APIs' }];
    const bySlug = new Map(providers.map((p) => [p.slug, p]));
    const flag = (v) => (v === false ? 'No' : v === true ? 'Yes' : 'Not confirmed');
    for (const t of tables) {
      for (const [slug, cells] of tableRows(page(t.slug), t.label)) {
        const p = bySlug.get(slug);
        const [card, commercial, data, checked] = cells.slice(-4);
        assert.ok(stripTags(card).startsWith(`Card: ${flag(p.card_required)}`), `${slug}: card`);
        assert.ok(stripTags(card).includes(`Phone: ${flag(p.phone_required)}`), `${slug}: phone`);
        const c = { true: 'Yes', false: 'No', conditional: 'Conditional' }[String(p.commercial_ok)] || 'Not confirmed';
        assert.ok(stripTags(commercial).startsWith(c), `${slug}: commercial use`);
        assert.ok(stripTags(data).replace(/&rsquo;|’/g, '’').startsWith(dataUseWords(p)), `${slug}: data use`);
        assert.ok(checked.includes(`<time datetime="${p.last_verified}">`), `${slug}: checked date`);
      }
    }
  });

  test('speech: the Covers column and the counts in the answer are read from each entry', () => {
    const html = page('free-speech-to-text-apis');
    const list = modalitySets(providers).speech;
    const rows = tableRows(html, 'Free speech-to-text and text-to-speech APIs compared');
    for (const p of list) {
      const m = speechMentions(p);
      const cell = stripTags(rows.get(p.slug)[1]);
      assert.equal(cell.includes('speech-to-text'), m.stt, `${p.slug}: speech-to-text`);
      assert.equal(cell.includes('text-to-speech'), m.tts, `${p.slug}: text-to-speech`);
      if (!m.stt && !m.tts) assert.ok(cell.includes('Not stated in its entry'), p.slug);
    }
    const stt = list.filter((p) => speechMentions(p).stt).length;
    const tts = list.filter((p) => speechMentions(p).tts).length;
    const both = list.filter((p) => speechMentions(p).stt && speechMentions(p).tts).length;
    assert.ok(answerOf(html).includes(`${stt} mention speech-to-text (transcription) and ${tts} text-to-speech; ${both} mention both`), answerOf(html));
  });

  test('embeddings: the quickstart is the repository’s, with a listed provider’s base URL and one of its free embedding models', () => {
    const html = page('free-embeddings-apis');
    const list = modalitySets(providers).embeddings;
    const qs = embeddingsQuickstartProvider(list);
    assert.ok(qs, 'a provider qualifies today');
    const py = html.match(/<pre><code class="language-python">([\s\S]*?)<\/code><\/pre>/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    assert.ok(py.includes(`base_url="${qs.openai_base_url}"`), 'its base URL');
    assert.ok(py.includes(`model="${embeddingModel(qs)}"`) && (qs.models_free || []).includes(embeddingModel(qs)), 'a free model from its entry');
    assert.ok(py.includes('client.embeddings.create('), 'an embeddings call');
    assert.ok(list.includes(qs) && qs.openai_compatible === true && qs.verified === true);
  });

  test('the gotchas count each unconfirmed flag and quote only the entries’ own watermark sentences', () => {
    const s = modalitySets(providers);
    const lists = { 'free-embeddings-apis': s.embeddings, 'free-speech-to-text-apis': s.speech, 'free-ocr-document-ai-apis': s.ocr, 'free-image-generation-apis': s.image };
    const LABEL = { commercial_ok: 'Commercial use', card_required: 'The card requirement', phone_required: 'The phone requirement' };
    for (const [slug, list] of Object.entries(lists)) {
      const text = textOf(page(slug));
      for (const [field, label] of Object.entries(LABEL)) {
        const n = list.filter((p) => p[field] == null).length;
        if (n) assert.ok(text.includes(`${label} isn’t confirmed for ${n} of ${list.length}:`), `${slug}: ${field}`);
        else assert.ok(!text.includes(`${label} isn’t confirmed`), `${slug}: ${field} has no unknowns`);
      }
      const noPolicy = list.filter((p) => !p.data_policy).length;
      if (noPolicy) assert.ok(text.includes(`No quoted data policy is recorded for ${noPolicy} of ${list.length}:`), `${slug}: data policy`);
      for (const p of list) {
        for (const sentence of watermarkSentences(p)) assert.ok(`${p.free_tier} ${p.notes}`.includes(sentence), `${p.slug}: quoted as written`);
      }
    }
  });

  test('every FAQ answer that counts or names providers says what the data says', () => {
    const s = modalitySets(providers);
    const count = (list, f) => list.filter(f).length;
    const commercial = (list) => count(list, (p) => p.commercial_ok === true);
    const answer = (slug, q) => faqOf(page(slug)).find((x) => x.name === q).acceptedAnswer.text;
    assert.ok(answer('free-embeddings-apis', 'Is there a free embedding API?').startsWith(`Yes. ${s.embeddings.length} of the ${s.verified} verified providers`));
    assert.ok(answer('free-embeddings-apis', 'Can I use a free embedding API commercially?').startsWith(`${commercial(s.embeddings)} of the ${s.embeddings.length}`));
    assert.ok(answer('free-ocr-document-ai-apis', 'Can I use a free OCR API commercially?').startsWith(`${commercial(s.ocr)} of the ${s.ocr.length}`));
    assert.ok(answer('free-image-generation-apis', 'Can I use free AI-generated images commercially?').includes(`${commercial(s.imageGeneration)} of the ${s.imageGeneration.length}`));
    const tts = s.speech.filter((p) => speechMentions(p).tts);
    assert.ok(answer('free-speech-to-text-apis', 'Can I use free text-to-speech voices commercially?').startsWith(`Of the ${tts.length} entries that mention text-to-speech, ${commercial(tts)} allow`));
    for (const p of s.ocr.filter((x) => x.card_required === false)) assert.ok(answer('free-ocr-document-ai-apis', 'Which free OCR API needs no credit card?').includes(p.name.replace(/&/g, '&amp;')), p.slug);
    for (const p of s.imageGeneration.filter((x) => x.anonymous_access)) assert.ok(answer('free-image-generation-apis', 'Is there a free image generation API?').includes(p.name.replace(/&/g, '&amp;')), p.slug);
  });

  test('each links to its provider pages, a collection, /compare/ and /not-free/', () => {
    for (const slug of ['free-embeddings-apis', 'free-speech-to-text-apis', 'free-ocr-document-ai-apis', 'free-image-generation-apis']) {
      const html = page(slug);
      assert.match(html, /href="\.\.\/p\/[a-z0-9-]+"/, `${slug}: provider pages`);
      assert.match(html, /href="\.\.\/collections\/[a-z-]+"/, `${slug}: a collection`);
      assert.match(html, /href="\.\.\/compare\/\?compare=[a-z0-9-]+,[a-z0-9-]+"/, `${slug}: a comparison`);
      assert.ok(html.includes('href="../not-free/"'), `${slug}: /not-free/`);
    }
  });

  test('removing a provider and flipping its flags changes the modality guides', () => {
    const guide = (slug) => LONG_GUIDES.find((g) => g.slug === slug);
    const render = (list) => Object.fromEntries(MODALITY.map((g) => g.slug).concat('free-image-generation-apis').map((slug) => [slug, longGuidePage(guide(slug), { providers: list, notFree })]));
    const base = render(providers);
    const changed = providers
      .filter((p) => p.slug !== 'jina-ai')
      .map((p) => (p.slug === 'ocr-space' ? { ...p, commercial_ok: false, notes: `${p.notes} Free output is watermarked.` } : p));
    const next = render(changed);
    assert.equal(next['free-embeddings-apis'].count, base['free-embeddings-apis'].count - 1);
    assert.ok(!next['free-embeddings-apis'].body.includes('../p/jina-ai"'));
    assert.ok(next['free-embeddings-apis'].title.includes(`(${base['free-embeddings-apis'].count - 1}, Checked)`));
    const ocr = next['free-ocr-document-ai-apis'];
    const faq = ocr.faq.find((f) => f.q === 'Can I use a free OCR API commercially?').a;
    assert.match(faq, /OCR\.space doesn’t\./);
    assert.ok(ocr.faq.find((f) => f.q === 'Does free OCR add a watermark?').a.includes('OCR.space'));
    assert.notEqual(ocr.body, base['free-ocr-document-ai-apis'].body);
  });
});

// ---------- the use-case guides: coding, RAG, agents, a chatbot, students ----------
const USE_CASE = ['free-llm-api-for-coding', 'free-api-for-rag', 'free-llm-api-for-ai-agents', 'free-chatbot-api', 'free-ai-api-for-students'];
const extras = () => ({ programs: JSON.parse(read('data/programs.json')), codingToolsOwnKey: JSON.parse(read('data/coding-tools-own-key.json')) });
const partsOf = (slug, list = providers) => longGuidePage(LONG_GUIDES.find((g) => g.slug === slug), { providers: list, notFree, ...extras() });
const codeBlocks = (html) => [...html.matchAll(/<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g)]
  .map((m) => ({ lang: m[1], src: m[2].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') }));
const slugsOf = (list) => sorted(list.map((p) => p.slug));

describe('the use-case guides', () => {
  test('are in the use-case group and in their own section of the hub', () => {
    assert.deepEqual(LONG_GUIDES.filter((g) => g.group === 'use-case').map((g) => g.slug), USE_CASE);
    const hub = read('site/guides-and-collections/index.html');
    const at = hub.indexOf('Guides: by what you’re building');
    assert.ok(at >= 0, 'the hub has the section');
    const section = hub.slice(at, hub.indexOf('<h2', at + 1));
    assert.deepEqual([...section.matchAll(/href="\.\.\/guides\/([a-z0-9-]+)"/g)].map((m) => m[1]), USE_CASE);
    for (const g of LONG_GUIDES.filter((x) => x.group !== 'use-case')) assert.ok(!section.includes(`../guides/${g.slug}"`), `${g.slug} stays in its own section`);
  });

  test('each links to /find/ with a preset the wizard reads, and to provider pages, a collection, /compare/ and /not-free/', () => {
    const want = {
      'free-llm-api-for-coding': { use: 'code', openai: 'yes' },
      'free-api-for-rag': { use: 'embeddings' },
      'free-llm-api-for-ai-agents': { use: 'chat', commercial: 'yes', openai: 'yes' },
      'free-chatbot-api': { use: 'chat', card: 'no', phone: 'no', commercial: 'yes', train: 'yes' },
      'free-ai-api-for-students': { use: 'chat', card: 'no', phone: 'no' },
    };
    for (const slug of USE_CASE) {
      const html = page(slug);
      const hash = html.match(/href="\.\.\/find\/#([^"]+)"/);
      assert.ok(hash, `${slug}: links to /find/ with a hash`);
      assert.deepEqual(parseHash(hash[1].replace(/&amp;/g, '&')), want[slug], `${slug}: the preset`);
      assert.match(html, /href="\.\.\/p\/[a-z0-9-]+"/, `${slug}: provider pages`);
      assert.match(html, /href="\.\.\/collections\/[a-z-]+"/, `${slug}: a collection`);
      assert.match(html, /href="\.\.\/compare\/\?compare=[a-z0-9-]+(,[a-z0-9-]+)+"/, `${slug}: a comparison`);
      assert.ok(html.includes('href="../not-free/"'), `${slug}: /not-free/`);
      assert.ok(html.includes('aria-label="Pick a '), `${slug}: a pick-a-stack table`);
    }
  });

  test('every table row shows the entry’s own card, phone, commercial, data-use and date, with unknowns as not confirmed', () => {
    const tables = {
      'free-llm-api-for-coding': ['Renewing free LLM APIs for coding', 'Free LLM APIs for coding with one-time credits'],
      'free-api-for-rag': ['Free embedding APIs for RAG', 'Free reranking APIs for RAG', 'Renewing free text LLMs for RAG'],
      'free-llm-api-for-ai-agents': ['Renewing free LLM APIs for AI agents', 'Free LLM APIs for AI agents with one-time credits'],
      'free-ai-api-for-students': ['Renewing free AI APIs with no credit card'],
    };
    const bySlug = new Map(providers.map((p) => [p.slug, p]));
    const flag = (v) => (v === false ? 'No' : v === true ? 'Yes' : 'Not confirmed');
    for (const [slug, labels] of Object.entries(tables)) {
      for (const label of labels) {
        for (const [ps, cells] of tableRows(page(slug), label)) {
          const p = bySlug.get(ps);
          const [card, commercial, data, checked] = cells.slice(-4);
          assert.ok(stripTags(card).startsWith(`Card: ${flag(p.card_required)}`) && stripTags(card).includes(`Phone: ${flag(p.phone_required)}`), `${slug} ${ps}: card and phone`);
          assert.ok(stripTags(commercial).startsWith({ true: 'Yes', false: 'No', conditional: 'Conditional' }[String(p.commercial_ok)] || 'Not confirmed'), `${slug} ${ps}: commercial use`);
          assert.ok(stripTags(data).startsWith(dataUseWords(p)), `${slug} ${ps}: data use`);
          assert.ok(checked.includes(`<time datetime="${p.last_verified}">`), `${slug} ${ps}: date`);
        }
      }
    }
  });

  test('coding: the tables are the OpenAI-compatible text LLMs, the speeds are the published ones, the quickstart a listed provider’s', () => {
    const html = page('free-llm-api-for-coding');
    const S = codingSets(providers);
    const compat = textLlms(providers).filter((p) => p.openai_compatible === true && /^https:\/\//.test(p.openai_base_url || ''));
    assert.deepEqual(slugsOf(S.compat), slugsOf(compat));
    assert.deepEqual(sorted(tableSlugs(html, 'Renewing free LLM APIs for coding')), slugsOf(compat.filter((p) => p.category === 'ongoing')));
    assert.deepEqual(sorted(tableSlugs(html, 'Free LLM APIs for coding with one-time credits')), slugsOf(compat.filter((p) => p.category !== 'ongoing')));
    const speeds = providers.filter((p) => S.text.includes(p)).flatMap((p) => (p.published_speed || []).map((s) => `${p.slug}:${s.model}`));
    const at = html.indexOf('aria-label="Published output speeds of free text LLMs"');
    const rows = [...html.slice(at, html.indexOf('</tbody>', at)).matchAll(/<tr><td class="name"><a href="\.\.\/p\/([a-z0-9-]+)">[^<]*<\/a><\/td><td><code>([\s\S]*?)<\/code>/g)].map((m) => `${m[1]}:${m[2].replace(/<wbr>/g, '')}`);
    assert.deepEqual(sorted(rows), sorted(speeds), 'one row per published speed');
    assert.ok(answerOf(html).startsWith(`${compat.length} of the ${providers.filter((p) => p.verified).length} verified providers`));
    assert.ok(partsOf('free-llm-api-for-coding').title.includes(`${compat.length} OpenAI-Compatible`));
    const py = codeBlocks(html).find((c) => c.lang === 'python').src;
    const qs = compat.find((p) => py.includes(`base_url="${p.openai_base_url}"`));
    assert.ok(qs && qs.category === 'ongoing' && qs.card_required === false, 'a renewing, no-card provider');
    assert.ok((qs.models_free || []).some((m) => py.includes(`model="${m}"`)), 'one of its free models');
    // The own-key coding tools are named from data/coding-tools-own-key.json, and the page renders without that file.
    for (const t of extras().codingToolsOwnKey.entries) assert.ok(html.includes(`href="../coding-tools/${t.slug}/"`), t.slug);
    const bare = longGuidePage(LONG_GUIDES.find((g) => g.slug === 'free-llm-api-for-coding'), { providers, notFree });
    assert.ok(!bare.body.includes('coding-tools/zed'), 'no own-key list without the data');
  });

  test('RAG: the three tables are the data and the worked example calls the picked providers’ own base URLs and models', () => {
    const html = page('free-api-for-rag');
    const S = ragSets(providers);
    const verified = providers.filter((p) => p.verified === true && !NO_FREE_MODEL_CALLS.includes(p.slug));
    assert.deepEqual(sorted(tableSlugs(html, 'Free embedding APIs for RAG')), slugsOf(verified.filter((p) => p.modalities.includes('embeddings'))));
    assert.deepEqual(sorted(tableSlugs(html, 'Free reranking APIs for RAG')), slugsOf(verified.filter((p) => p.modalities.includes('rerank'))));
    assert.deepEqual(sorted(tableSlugs(html, 'Renewing free text LLMs for RAG')), slugsOf(verified.filter((p) => p.is_text_llm === true && p.category === 'ongoing')));
    assert.equal(partsOf('free-api-for-rag').count, new Set([...S.embeddings, ...S.rerank, ...S.llm]).size);
    const { easy } = ragStack(providers);
    assert.ok(easy.embeddings && easy.llm, 'a stack exists today');
    const py = codeBlocks(html).find((c) => c.lang === 'python').src;
    assert.ok(py.includes(`"${easy.embeddings.openai_base_url}"`) && py.includes(`model="${embeddingModel(easy.embeddings)}"`), 'the embeddings pick');
    assert.ok((easy.embeddings.models_free || []).includes(embeddingModel(easy.embeddings)));
    assert.ok(py.includes(`"${easy.llm.openai_base_url}"`) && (easy.llm.models_free || []).some((m) => py.includes(`model="${m}"`)), 'the LLM pick');
    assert.ok(easy.embeddings.card_required === false && easy.llm.card_required === false, 'the example needs no card, as the answer says');
    assert.ok(py.includes('embed.embeddings.create(') && py.includes('llm.chat.completions.create('));
    const both = S.embeddings.filter((p) => S.rerank.includes(p));
    const faq = faqOf(html).find((q) => q.name === 'Which free API has both embeddings and reranking?').acceptedAnswer.text;
    for (const p of both) assert.ok(faq.includes(p.name), p.slug);
  });

  test('agents: the tables are every free text LLM, and tool calling is never claimed', () => {
    const html = page('free-llm-api-for-ai-agents');
    const S = agentSets(providers);
    const text = textLlms(providers);
    assert.deepEqual(sorted([...tableSlugs(html, 'Renewing free LLM APIs for AI agents'), ...tableSlugs(html, 'Free LLM APIs for AI agents with one-time credits')]), slugsOf(text));
    const faq = faqOf(html).find((q) => q.name === 'Which free LLM APIs support tool calling?').acceptedAnswer.text;
    assert.ok(faq.startsWith('Our dataset doesn’t record tool or function calling.') && faq.includes(`${S.compat.length} of the ${text.length} free text LLMs`));
    // The page asks which providers support tool calling; it never answers that one does.
    assert.doesNotMatch(textOf(html), /\b(supports|does support) (tool|function) calling\b|(tool|function) calling is supported/i);
    assert.ok(!AGENT_WORDS.test('Every request needs a User-Agent header'), 'a User-Agent header is not an agent');
    for (const p of S.mentions) assert.ok(html.includes(`<a href="../p/${p.slug}">`), `${p.slug}: its mention is quoted`);
    const rows = tableRows(html, 'Renewing free LLM APIs for AI agents');
    for (const [slug, cells] of rows) {
      const p = providers.find((x) => x.slug === slug);
      const want = p.openai_compatible === true ? 'Yes' : p.openai_compatible === false ? 'No' : 'Not confirmed';
      assert.ok(stripTags(cells[1]).startsWith(want), `${slug}: OpenAI-compatible`);
    }
  });

  test('chatbot: every check cell is the wizard’s own state, and "all four" is exactly the providers that pass them', () => {
    const html = page('free-chatbot-api');
    const S = chatbotSets(providers);
    const text = textLlms(providers);
    const rows = tableRows(html, 'Free chatbot APIs checked for card, phone, commercial use and training');
    assert.deepEqual(sorted([...rows.keys()]), slugsOf(text));
    for (const p of text) {
      const cells = rows.get(p.slug);
      CHATBOT_CHECKS.forEach((c, i) => {
        const cell = stripTags(cells[2 + i]);
        const s = constraintState(p, c);
        if (s === 'yes') assert.equal(cell, 'Yes', `${p.slug} ${c.key}`);
        else assert.ok(!cell.startsWith('Yes'), `${p.slug} ${c.key}: an unconfirmed check is never yes`);
      });
      assert.equal(stripTags(cells[6]), `${chatbotPasses(p)} of 4`, `${p.slug}: confirmed count`);
    }
    const all = text.filter((p) => CHATBOT_CHECKS.every((c) => constraintState(p, c) === 'yes'));
    assert.deepEqual(slugsOf(S.all), slugsOf(all));
    for (const p of all) assert.ok(answerOf(html).includes(p.name), p.slug);
    assert.ok(answerOf(html).startsWith(`We checked all ${text.length} free text LLMs`));
    const phone = faqOf(html).find((q) => q.name === 'Does a free chatbot API need a phone number?').acceptedAnswer.text;
    assert.equal(phone, `Of the ${text.length} free text LLMs, ${text.filter((p) => p.phone_required === false).length} confirm no phone, ${text.filter((p) => p.phone_required === true).length} require one, and ${text.filter((p) => p.phone_required == null).length} don’t state it.`);
  });

  test('students: the table is every renewing no-card entry, the no-account and programs sections are the data', () => {
    const html = page('free-ai-api-for-students');
    const S = studentSets(providers, extras().programs);
    const want = providers.filter((p) => p.verified === true && p.category === 'ongoing' && p.card_required === false && !NO_FREE_MODEL_CALLS.includes(p.slug));
    assert.deepEqual(sorted(tableSlugs(html, 'Renewing free AI APIs with no credit card')), slugsOf(want));
    assert.ok(partsOf('free-ai-api-for-students').title.includes(`(${want.length}, Checked)`));
    for (const p of providers.filter((x) => x.verified && x.anonymous_access)) assert.ok(html.includes(`<a href="../p/${p.slug}">`), `${p.slug}: no-account section`);
    const programs = extras().programs.research.filter((r) => /student|both/i.test(r.audience));
    assert.equal(S.programs.length, programs.length);
    for (const r of programs) assert.ok(html.includes(r.name.replace(/&/g, '&amp;')), r.name);
    const at = html.indexOf('aria-label="Pick a free AI API for learning"');
    const row = html.slice(at, html.indexOf('</tbody>', at)).match(/<tr><td class="name">Try a model with no account<\/td><td><a href="\.\.\/p\/([a-z0-9-]+)">/);
    assert.ok(row && providers.find((p) => p.slug === row[1]).anonymous_access, 'the no-account pick has anonymous access');
  });

  test('the copy follows the data: removing a provider and flipping flags changes counts, picks and lists', () => {
    const base = Object.fromEntries(USE_CASE.map((slug) => [slug, partsOf(slug)]));
    // The top chatbot pick: one that passes all four checks, or else the best one a single unconfirmed check short of it.
    const sets = chatbotSets(providers);
    const all4 = sets.all[0] || sets.close[0];
    assert.ok(all4, 'a provider passes all four chatbot checks, or all but one, today');
    const changed = providers
      .filter((p) => p.slug !== 'groq')
      .map((p) => (p.slug === all4.slug ? { ...p, phone_required: null } : p.slug === 'llamaparse' ? { ...p, card_required: null } : p));
    const next = Object.fromEntries(USE_CASE.map((slug) => [slug, partsOf(slug, changed)]));
    assert.equal(next['free-llm-api-for-coding'].count, base['free-llm-api-for-coding'].count - 1);
    assert.ok(!next['free-llm-api-for-coding'].body.includes('../p/groq"'));
    assert.equal(next['free-llm-api-for-ai-agents'].count, base['free-llm-api-for-ai-agents'].count - 1);
    assert.ok(!chatbotSets(changed).all.some((p) => p.slug === all4.slug), 'an unconfirmed phone keeps it out of "all four"');
    assert.notEqual(next['free-chatbot-api'].answer, base['free-chatbot-api'].answer);
    assert.equal(next['free-ai-api-for-students'].count, base['free-ai-api-for-students'].count - 2, 'Groq removed, LlamaParse’s card unconfirmed');
    assert.notEqual(next['free-api-for-rag'].body, base['free-api-for-rag'].body);
    assert.ok(topSpeed(providers.find((p) => p.slug === 'groq')), 'Groq publishes a speed, so removing it changes the speed table');
  });
});
