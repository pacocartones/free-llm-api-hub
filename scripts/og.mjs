#!/usr/bin/env node
// Renders social-preview PNGs from SVG: the site-wide og.png plus one per collection.
// X/Facebook don't render SVG OG images, so we rasterize. Run after content changes: `npm run og`.
// Uses @resvg/resvg-js — a devDependency only; the shipped site and CI stay dependency-free.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { Resvg } = await import('@resvg/resvg-js');
const render = (svg, out) => {
  const png = new Resvg(Buffer.isBuffer(svg) ? svg : Buffer.from(svg), { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  writeFileSync(out, png);
  return png.length;
};

// site-wide OG (from the hand-authored template)
let n = render(readFileSync(join(ROOT, 'site/og.svg')), join(ROOT, 'site/og.png'));
console.log(`og.png: ${(n / 1024).toFixed(0)} KB`);

// per-collection OG — keep filters in sync with COLLECTIONS in scripts/build.mjs
const { providers } = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const COLLS = [
  { slug: 'no-credit-card', title: 'Free LLM APIs · no credit card', filter: (p) => p.card_required === false },
  { slug: 'no-phone', title: 'Free LLM APIs · no phone', filter: (p) => p.phone_required === false },
  { slug: 'commercial-use', title: 'Free LLM APIs · commercial use', filter: (p) => p.commercial_ok === true },
  { slug: 'openai-compatible', title: 'OpenAI-compatible free APIs', filter: (p) => p.openai_compatible === true },
  { slug: 'always-free', title: 'Permanently free LLM APIs', filter: (p) => p.free_type === 'perpetual' },
  { slug: 'multimodal', title: 'Free multimodal AI APIs', filter: (p) => (p.modalities || []).some((m) => m !== 'text') },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Wrap a title onto up to two lines at ~26 chars.
const wrap = (t) => {
  const words = t.split(' '); const lines = ['']; const max = 26;
  for (const w of words) { if ((lines[lines.length - 1] + ' ' + w).trim().length > max && lines[lines.length - 1]) lines.push(w); else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim(); }
  return lines.slice(0, 2);
};

// Guides and the model index share the same OG template, differing only by the
// eyebrow label and the subtitle line. Keep titles/filters in sync with
// GUIDES in scripts/build.mjs.
const GUIDES = [
  { slug: 'free-llm-api-without-credit-card', title: 'Free LLM APIs · no credit card', filter: (p) => p.card_required === false && p.category === 'ongoing' },
  { slug: 'openai-compatible-free-apis', title: 'Free OpenAI-compatible APIs', filter: (p) => p.openai_compatible === true },
  { slug: 'free-llm-api-no-signup', title: 'Free APIs · no phone, no card', filter: (p) => p.card_required === false && p.phone_required === false && p.category === 'ongoing' },
  { slug: 'free-embeddings-apis', title: 'Free embeddings APIs for RAG', filter: (p) => (p.modalities || []).includes('embeddings') },
  { slug: 'free-speech-to-text-apis', title: 'Free speech APIs · STT & TTS', filter: (p) => (p.modalities || []).includes('audio') },
  { slug: 'free-image-generation-apis', title: 'Free image generation APIs', filter: (p) => (p.modalities || []).includes('image') },
  { slug: 'free-ocr-document-ai-apis', title: 'Free OCR & document AI APIs', filter: (p) => (p.modalities || []).includes('ocr') },
];

function tagSvg(label, title, subtitle) {
  const lines = wrap(title);
  const titleSvg = lines.map((l, i) => `<text x="80" y="${262 + i * 84}" fill="#d8e2dc" font-size="70" font-weight="700" letter-spacing="-2">${esc(l)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace">
  <defs>
    <radialGradient id="glow" cx="50%" cy="0%" r="70%"><stop offset="0" stop-color="#3fce8f" stop-opacity="0.16"/><stop offset="1" stop-color="#3fce8f" stop-opacity="0"/></radialGradient>
    <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#1d2a22"/></pattern>
  </defs>
  <rect width="1200" height="630" fill="#0a0d0b"/><rect width="1200" height="630" fill="url(#dots)"/><rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="0.5" y="0.5" width="1199" height="629" fill="none" stroke="#1d2a22"/>
  <g transform="translate(80,72)">
    <rect x="1" y="1" width="52" height="52" rx="14" fill="none" stroke="#3fce8f" stroke-width="2.4" stroke-opacity="0.35"/>
    <path d="M16 19 L25 27 L16 35" fill="none" stroke="#3fce8f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="29" y="33" width="12" height="4" rx="2" fill="#3fce8f"/>
  </g>
  <text x="152" y="107" fill="#d8e2dc" font-size="29" font-weight="700">free-llm-api-hub</text>
  <text x="80" y="180" fill="#3fce8f" font-size="24" font-weight="700" letter-spacing="6">&gt; ${esc(label)}</text>
  ${titleSvg}
  <text x="82" y="470" fill="#808f87" font-size="27">${esc(subtitle)}</text>
  <text x="80" y="588" fill="#56655c" font-size="21">freellmapihub.com</text>
</svg>`;
}

mkdirSync(join(ROOT, 'site/og/collections'), { recursive: true });
for (const c of COLLS) {
  const count = providers.filter(c.filter).length;
  render(tagSvg('COLLECTION', c.title, `${count} verified free APIs · dated · sourced · machine-readable`), join(ROOT, `site/og/collections/${c.slug}.png`));
}
console.log(`per-collection OG: ${COLLS.length} rendered.`);

mkdirSync(join(ROOT, 'site/og/guides'), { recursive: true });
for (const g of GUIDES) {
  const count = providers.filter(g.filter).length;
  render(tagSvg('GUIDE', g.title, `${count} verified providers · pick one and build`), join(ROOT, `site/og/guides/${g.slug}.png`));
}
console.log(`per-guide OG: ${GUIDES.length} rendered.`);

// model index OG
const modelCount = providers.reduce((n, p) => n + ((p.models_free || []).length), 0);
const modelProviders = providers.filter((p) => p.models_free && p.models_free.length).length;
render(tagSvg('INDEX', 'Free model index', `${modelCount} free models across ${modelProviders} providers`), join(ROOT, 'site/og/models.png'));
console.log('model-index OG: 1 rendered.');
