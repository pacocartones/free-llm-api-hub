// guides-a11y: every plain link in a guide's table cells is underlined (WCAG 1.4.1; axe link-in-text-block).
// `.table-scroll td > a` (a11y-guard.test.mjs) covers a link that is a direct child of its cell. The guides also put
// links one level down, inside a note or a line of their own, next to the cell's text; the QA pass of November 2026
// (docs/qa/post-brand-2026-11.md) found them coloured only. The guide pages carry `guide-prose`, and the rule below
// reaches every plain link in their table cells, and only there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LONG_GUIDES, longGuidePage } from './lib/long-guides.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CSS = readFileSync(join(ROOT, 'site/styles.css'), 'utf8');
const BUILD = readFileSync(join(ROOT, 'scripts/build.mjs'), 'utf8');
const SELECTOR = '.guide-prose .table-scroll td a:not([class])';

test('links in guide table cells are underlined, colour unchanged (WCAG 1.4.1; axe link-in-text-block)', () => {
  const rule = CSS.split('\n').find((line) => line.startsWith(`${SELECTOR} {`));
  assert.ok(rule, `styles.css has a rule for ${SELECTOR}`);
  // The same look as .prov-score a and .cmp-sub a.
  assert.match(rule, /\{[^}]*text-decoration: underline/);
  assert.match(rule, /\{[^}]*text-underline-offset: 2px/);
  // An underline only: the link keeps the colour every other link has.
  assert.doesNotMatch(rule, /(?:^|[{;\s])(?:color|background|border)\s*:/);
});

test('only the guide pages carry guide-prose, so the rule stays on guides', () => {
  const uses = BUILD.match(/class="wrap prose guide-prose"/g) || [];
  assert.equal(uses.length, 1, 'build.mjs writes guide-prose once');
  // ...in the loop over the long-form guides, before their answer line.
  const loop = BUILD.indexOf('for (const g of LONG_GUIDE_PAGES)');
  const at = BUILD.indexOf('class="wrap prose guide-prose"');
  assert.ok(loop !== -1 && at > loop && at < BUILD.indexOf('writeFileSync(join(ROOT, `site/guides/${g.slug}.html`)', loop));
  assert.ok(!/guide-prose/.test(CSS.replace(SELECTOR, '')), 'styles.css uses guide-prose in this rule only');
});

test('the guides do put links below the cell level, next to text, which only the guide rule reaches', () => {
  const { providers } = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  const nested = /<td>(?:(?!<\/td>).)+?<(?:span class="notes"|div)><a href="[^"]+"(?:(?!<\/td>).)*<\/td>/g;
  const found = {};
  for (const slug of ['free-llm-api-for-coding', 'free-open-source-llm-api', 'strongest-free-llm-api']) {
    const guide = LONG_GUIDES.find((g) => g.slug === slug);
    assert.ok(guide, slug);
    const { body } = longGuidePage(guide, { providers, notFree: [] });
    found[slug] = (body.match(nested) || []).length;
  }
  // At least one guide must still emit such a link, or the rule above guards nothing.
  assert.ok(Object.values(found).some((n) => n > 0), `nested table links per guide: ${JSON.stringify(found)}`);
});
