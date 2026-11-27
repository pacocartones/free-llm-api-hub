// Brand H1 page layouts: the home hero's field of auras and the provider hero (numbers and receipt). Each test names its mutant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const providers = JSON.parse(read('data/providers.json')).providers;

test('home hero: one aura per provider, decorative, with no links, and the key to read it', () => {
  // Mutant: turn the field into links (they would count as hero controls and cross a keyboard user's path), or drop the key.
  const html = read('site/index.html');
  const field = html.match(/<div class="aura-field" aria-hidden="true">([\s\S]*?)<\/div>/);
  assert.ok(field, 'the field, hidden from assistive technology');
  const cells = field[1].match(/<span class="aura-cell"><span class="aura[ "]/g) || [];
  assert.equal(cells.length, providers.length, 'one aura per provider');
  assert.doesNotMatch(field[1], /<a[ >]/, 'no link in the field');
  assert.match(html, /<div class="aura-key"><p class="aura-key-h">Each aura is one provider, drawn from its own data: a colour sector per modality; each provider page reads its own in words\.<\/p>/);
  assert.doesNotMatch(html.match(/<div class="aura-key">[\s\S]*?<\/div>/)[0], /<a[ >]/, 'the key adds no control to the hero');
  for (const w of ['rays from the centre', 'outer crown only', 'dashed circle', 'faded']) assert.ok(html.includes(`</b>${w}</span>`), 'key reading: ' + w);
  for (const w of ['Ongoing', 'Trial', 'Not stated', 'Checked 30+ days ago']) assert.ok(html.includes(`<b>${w}</b>`), 'key: ' + w);
  for (const w of ['text', 'vision', 'image', 'speech', 'embeddings', 'rerank', 'OCR']) assert.match(html, new RegExp(`aria-hidden="true"></span>${w}</li>`), 'hue named: ' + w);
  assert.match(html, /<h1>We read the docs\. <span class="h1-key">You ship the code\.<\/span><\/h1>/, 'the owner\'s tagline is the H1');
  assert.match(html, /<p class="eyebrow">Free LLM &amp; AI APIs · /, 'the search phrase stays above the fold');
});

test('provider hero: up to three published limits as numbers, the quoted receipt with its page and date', () => {
  // Mutant: invent a number for a provider without free_limits, or quote without saying where it was read.
  const groq = read('site/p/groq.html');
  assert.match(groq, /<dl class="prov-nums"><div><dt>requests\/min<\/dt><dd>30<\/dd><\/div><div><dt>requests\/day<\/dt><dd>1,000<\/dd><\/div><div><dt>tokens\/day<\/dt><dd>200K<\/dd><\/div><\/dl>/);
  assert.match(groq, /<blockquote class="prov-receipt"><p>“By default, Groq does not retain customer data for inference requests\.”<\/p><cite><a href="https:\/\/console\.groq\.com\/docs\/your-data" rel="noopener"[^>]*>console\.groq\.com\/docs\/your-data<\/a> · read <time datetime="2026-11-24">24 Nov 2026<\/time><\/cite><\/blockquote>/);
  const without = providers.find((p) => !p.free_limits && existsSync(new URL(`../site/p/${p.slug}.html`, import.meta.url)));
  assert.ok(without, 'a provider without structured limits');
  assert.doesNotMatch(read(`site/p/${without.slug}.html`), /class="prov-nums"/, without.slug + ': no numbers without free_limits');
});

test('generated pages keep a side gutter on phones: the hero wrap overrides only its vertical padding', () => {
  // Mutant: `.page-hero .wrap { padding: 34px 0 26px }` again; on a 390 px phone the breadcrumb, title and lede touch the edge.
  const css = read('site/styles.css');
  const rule = css.match(/\.page-hero \.wrap \{[^}]*\}/)[0];
  assert.doesNotMatch(rule, /padding:\s*\S+\s+0[\s;]/, 'no zero side padding');
  assert.match(rule, /padding-top: \d+px; padding-bottom: \d+px;/);
  assert.match(css, /\.wrap \{ max-width: 1180px; margin: 0 auto; padding: 0 24px; \}/);
  assert.match(css, /@media \(width <= 480px\) \{ \.wrap \{ padding-left: max\(16px, env\(safe-area-inset-left, 0px\)\); padding-right: max\(16px, env\(safe-area-inset-right, 0px\)\); \} \}/, 'at least 16px on phones');
});
