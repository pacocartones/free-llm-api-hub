// compare-a11y: verify links inside .cmp-sub are underlined for WCAG 1.4.1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTableHtml } from './lib/compare.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CSS = readFileSync(join(ROOT, 'site/styles.css'), 'utf8');

test('links inside .cmp-sub are underlined (WCAG 1.4.1; axe link-in-text-block)', () => {
  // (a) CSS must define the rule with both underline and offset.
  assert.match(CSS, /\.cmp-sub a \{[^}]*text-decoration: underline/);
  assert.match(CSS, /\.cmp-sub a \{[^}]*text-underline-offset: 2px/);

  // (b) the selector is not invented: ground it in what the repo actually emits.
  const providers = [
    { slug: 'openai', name: 'OpenAI', verified: true, category: 'ongoing', free_type: 'Trial credit', free_tier: 'Generous free tier', commercial_ok: true, docs_url: 'https://openai.com/docs/' },
    { slug: 'anthropic', name: 'Anthropic', verified: true, category: 'ongoing', free_type: 'Trial credit', free_tier: 'Generous free tier', models_url: 'https://docs.anthropic.com/en/docs', commercial_ok: true, docs_url: 'https://docs.anthropic.com/en/docs' },
  ];
  const scores = { openai: { total: 95.5, confirmed: 4, of: 4, rank: 2 }, anthropic: { total: 94.0, confirmed: 4, of: 4, rank: 3 } };

  const html = compareTableHtml(providers, { prefix: '', scores });
  assert.match(html, /<div class="cmp-sub"><a href="https:\/\/docs\.anthropic\.com\/en\/docs"[^>]*>official catalogue ↗<\/a><\/div>/);
  // the score row puts its rank link in the same block, so it gets the underline too
  assert.match(html, /<div class="cmp-sub">4 of 4 inputs confirmed · <a href="best\/">#2 in the top 10<\/a><\/div>/);
});
