// og.mjs — shared by scripts/og.mjs (renders the PNGs + writes the manifest)
// and scripts/check-og.mjs (verifies each committed PNG matches the dataset).
//
// Every data-dependent OG image gets a fingerprint of the exact dataset inputs
// it renders. The manifest records those fingerprints at render time; the CI
// check recomputes them from data/providers.json and fails on any difference,
// so a provider whose status/category/flags changed without `npm run og` can
// no longer ship a stale social image.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { COLLECTIONS } from './collections.mjs';
import { injectInlineFigures, providerFigures } from './figures.mjs';
import { LONG_GUIDES } from './long-guides.mjs';

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

// The ONLY provider fields that reach a provider OG image (title + subtitle in
// scripts/og.mjs). Adding a field here means it also gets rendered there — and
// every change to these fields changes the image, so the fingerprint is exact
// with no false positives (e.g. a weekly last_verified bump does NOT stale an OG).
export const PROVIDER_OG_FIELDS = ['name', 'category', 'card_required', 'commercial_ok', 'openai_compatible'];

export const providerOgFingerprint = (p) => sha256(JSON.stringify(PROVIDER_OG_FIELDS.map((f) => p[f])));

export const COLLS = COLLECTIONS.map((c) => ({ ...c, title: c.ogTitle }));

export const renderHomeOg = (svg, providers) => injectInlineFigures(svg, providerFigures(providers));

// Guides and the model index share the same OG template. Keep filters in sync
// with GUIDES in scripts/build.mjs.
export const GUIDES = [
  { slug: 'free-llm-api-without-credit-card', title: 'Free LLM APIs · no credit card', filter: (p) => p.verified === true && p.card_required === false && p.category === 'ongoing' },
  { slug: 'openai-compatible-free-apis', title: 'Free OpenAI-compatible APIs', filter: (p) => p.verified === true && p.openai_compatible === true },
  { slug: 'free-llm-api-no-signup', title: 'Free APIs · no phone, no card', filter: (p) => p.verified === true && p.card_required === false && p.phone_required === false && p.category === 'ongoing' },
  { slug: 'free-embeddings-apis', title: 'Free embeddings APIs for RAG', filter: (p) => p.verified === true && (p.modalities || []).includes('embeddings') },
  { slug: 'free-speech-to-text-apis', title: 'Free speech APIs · STT & TTS', filter: (p) => p.verified === true && (p.modalities || []).includes('audio') },
  { slug: 'free-image-generation-apis', title: 'Free image APIs · generation & editing', filter: (p) => p.verified === true && (p.modalities || []).includes('image') },
  { slug: 'free-reranking-apis', title: 'Free reranking APIs for RAG', filter: (p) => p.verified === true && (p.modalities || []).includes('rerank') },
  { slug: 'free-vision-apis', title: 'Free vision APIs · image understanding', filter: (p) => p.verified === true && (p.modalities || []).includes('vision') },
  { slug: 'free-ocr-document-ai-apis', title: 'Free OCR & document AI APIs', filter: (p) => p.verified === true && (p.modalities || []).includes('ocr') },
];

// Section images for pages that used the site-wide og.png: the comparisons, the coding tools, the API, /not-free/ and /embed/. Their
// text is fixed (no count), so a comparison set or tool list that changes with the data never stales them; the
// fingerprint is the text itself, which lets check-og.mjs report a missing or outdated one.
export const SECTION_OGS = [
  { file: 'compare.png', label: 'COMPARE', title: 'Free LLM APIs side by side', subtitle: 'limits · card · phone · commercial use' },
  { file: 'coding-tools.png', label: 'CODING TOOLS', title: 'Free AI coding tools', subtitle: "each value with the tool's own sentence" },
  { file: 'api.png', label: 'API', title: 'Static JSON API', subtitle: 'versioned · CORS-open · no key' },
  { file: 'not-free.png', label: 'NOT FREE', title: 'LLM APIs that are not free', subtitle: "the provider's own words · dated · free alternatives" },
  { file: 'embed.png', label: 'USE THE DATA', title: 'Widget, badges, API, citation', subtitle: 'MIT · no key · no tracking' },
  // The long-form guides carry fixed text too (no count), so a dataset change never stales their image.
  ...LONG_GUIDES.map((g) => ({ file: `guides/${g.slug}.png`, label: 'GUIDE', title: g.ogTitle, subtitle: g.ogSubtitle })),
];

// The manifest every data-dependent OG must match: file name -> fingerprint of
// what it renders. Collections/guides/models render only a count, so their
// fingerprint is the count (a join+leave with the same net count renders the
// identical image — correctly not flagged).
export const buildOgManifest = (providers, homeSvg = readFileSync(new URL('../../site/og.svg', import.meta.url), 'utf8')) => {
  const og = { '../og.png': sha256(renderHomeOg(homeSvg, providers)) };
  for (const c of COLLS) og[`collections/${c.slug}.png`] = sha256(String(providers.filter(c.filter).length));
  for (const g of GUIDES) og[`guides/${g.slug}.png`] = sha256(String(providers.filter(g.filter).length));
  const modelCount = providers.reduce((n, p) => n + (p.models_free || []).length, 0);
  const modelProviders = providers.filter((p) => p.models_free && p.models_free.length).length;
  og['models.png'] = sha256(`${modelCount}:${modelProviders}`);
  for (const p of providers) og[`p/${p.slug}.png`] = providerOgFingerprint(p);
  for (const o of SECTION_OGS) og[o.file] = sha256(JSON.stringify([o.label, o.title, o.subtitle]));
  return og;
};
