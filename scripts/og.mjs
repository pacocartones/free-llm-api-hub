#!/usr/bin/env node
// Renders social-preview PNGs from SVG: the site-wide og.png plus one per collection.
// X/Facebook don't render SVG OG images, so we rasterize. Run after content changes: `npm run og`.
// Uses @resvg/resvg-js — a devDependency only; the shipped site stays runtime-dependency-free. The artwork is brand H1
// (lib/og-art.mjs) and the text is set in the fonts of tools/og-fonts/ (system fonts are not loaded, so every machine
// renders the same image).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Collection/guide filter lists and the data fingerprints live in lib/og.mjs,
// shared with the CI check (scripts/check-og.mjs) so both always agree.
import { COLLS, GUIDES, SECTION_OGS, buildOgManifest, renderHomeOg } from './lib/og.mjs';
import { OG_FONT_FILES, tagCardSvg, providerCardSvg, ogAuraSpec } from './lib/og-art.mjs';
import { stampSources } from './lib/stamp.mjs';
const { Resvg } = await import('@resvg/resvg-js');
const FONT = { fontFiles: OG_FONT_FILES.map((f) => join(ROOT, 'tools/og-fonts', f)), loadSystemFonts: false, defaultFontFamily: 'OG Text' };
const render = (svg, out) => {
  const png = new Resvg(Buffer.isBuffer(svg) ? svg : Buffer.from(svg), { fitTo: { mode: 'width', value: 1200 }, font: FONT }).render().asPng();
  writeFileSync(out, png);
  return png.length;
};

const { providers } = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
// Keep the editable SVG and its raster preview on the same derived figures.
const homeSvg = renderHomeOg(readFileSync(join(ROOT, 'site/og.svg'), 'utf8'), providers);
writeFileSync(join(ROOT, 'site/og.svg'), homeSvg);
let n = render(homeSvg, join(ROOT, 'site/og.png'));
console.log(`og.png: ${(n / 1024).toFixed(0)} KB`);

// Collections and guides draw the auras of their first 16 members (the same slice their fingerprint hashes).
const tagSvg = (label, title, subtitle, members = null) => tagCardSvg({ label, title, subtitle, specs: members && members.slice(0, 16).map(ogAuraSpec) });

mkdirSync(join(ROOT, 'site/og/collections'), { recursive: true });
for (const c of COLLS) {
  const members = providers.filter(c.filter);
  render(tagSvg('COLLECTION', c.title, `${members.length} providers · dated · sourced`, members), join(ROOT, `site/og/collections/${c.slug}.png`));
}
console.log(`per-collection OG: ${COLLS.length} rendered.`);

mkdirSync(join(ROOT, 'site/og/guides'), { recursive: true });
for (const g of GUIDES) {
  const members = providers.filter(g.filter);
  render(tagSvg('GUIDE', g.title, `${members.length} verified providers · pick one and build`, members), join(ROOT, `site/og/guides/${g.slug}.png`));
}
console.log(`per-guide OG: ${GUIDES.length} rendered.`);
// model index OG
const modelCount = providers.reduce((n, p) => n + ((p.models_free || []).length), 0);
const modelProviders = providers.filter((p) => p.models_free && p.models_free.length).length;
render(tagSvg('INDEX', 'Free model index', `${modelCount} free models across ${modelProviders} providers`), join(ROOT, 'site/og/models.png'));
console.log('model-index OG: 1 rendered.');

for (const o of SECTION_OGS) render(tagSvg(o.label, o.title, o.subtitle), join(ROOT, `site/og/${o.file}`));
console.log(`section OG: ${SECTION_OGS.length} rendered.`);

// per-provider OG
mkdirSync(join(ROOT, 'site/og/p'), { recursive: true });
const provSub = (p) => {
  const bits = [p.category === 'ongoing' ? 'Ongoing free tier' : 'Trial credit'];
  if (p.card_required === false) bits.push('no card');
  if (p.commercial_ok === true) bits.push('commercial OK');
  if (p.openai_compatible === true) bits.push('OpenAI-compatible');
  return bits.join(' · ');
};
for (const p of providers) {
  render(providerCardSvg(p, provSub(p), stampSources(p).length), join(ROOT, `site/og/p/${p.slug}.png`));
}
console.log(`per-provider OG: ${providers.length} rendered.`);

// Data fingerprints of every image just rendered. Committed alongside the PNGs
// so CI (scripts/check-og.mjs) can verify each one still matches the dataset.
writeFileSync(join(ROOT, 'site/og/manifest.json'), JSON.stringify(buildOgManifest(providers, homeSvg), null, 2) + '\n');
console.log(`manifest: ${Object.keys(buildOgManifest(providers, homeSvg)).length} fingerprints written.`);
