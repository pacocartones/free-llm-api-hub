// Brand H1 page layouts: the home hero's field of auras and the provider hero (numbers and receipt). Each test names its mutant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const providers = JSON.parse(read('data/providers.json')).providers;

test('home hero: one aura per provider, decorative, with no tab stop, and the key to read it', () => {
  // Mutant: give the 70 field links tab stops (a keyboard user would cross them all before the explorer), or drop the key.
  const html = read('site/index.html');
  const field = html.match(/<div class="aura-field" aria-hidden="true">([\s\S]*?)<\/div>/);
  assert.ok(field, 'the field, hidden from assistive technology');
  const links = field[1].match(/<a href="p\/[a-z0-9-]+" tabindex="-1"><span class="aura[ "]/g) || [];
  assert.equal(links.length, providers.length, 'one aura per provider');
  assert.doesNotMatch(field[1], /<a (?![^>]*tabindex="-1")/, 'no link in the field takes a tab stop');
  assert.match(html, /<div class="aura-key"><p class="aura-key-h">Each circle is one provider, drawn from its own data\. <a href="methodology\/#how-to-read-an-aura">How to read it<\/a>/);
  for (const w of ['Ongoing', 'Trial', 'Not stated', 'Checked 30+ days ago']) assert.ok(html.includes(`<b>${w}</b>`), 'key: ' + w);
  for (const w of ['text', 'vision', 'image', 'speech', 'embeddings', 'rerank', 'OCR']) assert.match(html, new RegExp(`aria-hidden="true"></span>${w}</li>`), 'hue named: ' + w);
  assert.match(html, /<h1>Free LLM APIs you can<br> <span class="h1-key">actually build on\.<\/span><\/h1>/, 'the H1 text is unchanged (SEO)');
});

test('provider hero: up to three published limits as numbers, the quoted receipt with its page and date', () => {
  // Mutant: invent a number for a provider without free_limits, or quote without saying where it was read.
  const groq = read('site/p/groq.html');
  assert.match(groq, /<dl class="prov-nums"><div><dt>requests\/min<\/dt><dd>30<\/dd><\/div><div><dt>requests\/day<\/dt><dd>1,000<\/dd><\/div><div><dt>tokens\/day<\/dt><dd>200K<\/dd><\/div><\/dl>/);
  assert.match(groq, /<blockquote class="prov-receipt"><p>“By default, Groq does not retain customer data for inference requests\.”<\/p><cite><a href="https:\/\/console\.groq\.com\/docs\/your-data" rel="noopener"[^>]*>console\.groq\.com\/docs\/your-data<\/a> · read 2026-11-24<\/cite><\/blockquote>/);
  const without = providers.find((p) => !p.free_limits && existsSync(new URL(`../site/p/${p.slug}.html`, import.meta.url)));
  assert.ok(without, 'a provider without structured limits');
  assert.doesNotMatch(read(`site/p/${without.slug}.html`), /class="prov-nums"/, without.slug + ': no numbers without free_limits');
});
