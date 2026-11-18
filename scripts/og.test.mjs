import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOgManifest, renderHomeOg, COLLS } from './lib/og.mjs';
import { ogIssues } from './check-og.mjs';

const svg = '<svg><!-- FIG:providers -->47<!-- /FIG --> / <!-- FIG:verified -->47<!-- /FIG --></svg>';
const providers = [{ slug: 'example', verified: true, data_policy: { trains_on_prompts: false } }, { slug: 'pending', verified: false }];

test('home OG derives counts and fingerprints data and artwork', () => {
  const rendered = renderHomeOg(svg, providers);
  assert.match(rendered, /providers -->2<!--/);
  assert.match(rendered, /verified -->1<!--/);
  assert.equal(renderHomeOg(rendered, providers), rendered);
  const fingerprint = buildOgManifest(providers, svg)['../og.png'];
  assert.notEqual(buildOgManifest(providers.map((p) => ({ ...p, verified: true })), svg)['../og.png'], fingerprint);
  assert.notEqual(buildOgManifest(providers, svg.replace('<svg>', '<svg fill="red">'))['../og.png'], fingerprint);
});

test('shipped home template retains both dynamic statistics', () => {
  const template = readFileSync(new URL('../site/og.svg', import.meta.url), 'utf8');
  const rendered = renderHomeOg(template, providers);
  assert.equal((rendered.match(/<!-- FIG:providers -->2<!-- \/FIG -->/g) || []).length, 2);
  assert.match(rendered, /<!-- FIG:verified -->1<!-- \/FIG -->/);
});

test('no-training roster counts only explicit false', () => {
  const collection = COLLS.find((c) => c.slug === 'no-training');
  assert.ok(collection);
  assert.equal(providers.filter(collection.filter).length, 1);
  assert.ok(buildOgManifest(providers, svg)['collections/no-training.png']);
});

test('checker detects missing roster entries, absent PNGs and stale home SVG', () => {
  const rendered = renderHomeOg(svg, providers);
  const manifest = buildOgManifest(providers, rendered);
  assert.deepEqual(ogIssues(providers, rendered, manifest, () => true), { missing: [], stale: [] });
  const missing = new Set(['collections/no-training.png', '../og.png', 'guides/free-vision-apis.png', 'models.png']);
  assert.deepEqual(new Set(ogIssues(providers, rendered, manifest, (f) => !missing.has(f)).missing), missing);
  delete manifest['collections/no-training.png'];
  assert.ok(ogIssues(providers, rendered, manifest, () => true).stale.includes('collections/no-training.png'));
  assert.ok(ogIssues(providers, svg, manifest, () => true).stale.includes('../og.svg'));
});
