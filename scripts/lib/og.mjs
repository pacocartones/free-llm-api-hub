// og.mjs — shared by scripts/og.mjs (renders the PNGs + writes the manifest)
// and scripts/check-og.mjs (verifies each committed PNG matches the dataset).
//
// Every data-dependent OG image gets a fingerprint of the exact dataset inputs
// it renders. The manifest records those fingerprints at render time; the CI
// check recomputes them from data/providers.json and fails on any difference,
// so a provider whose status/category/flags changed without `npm run og` can
// no longer ship a stale social image.

import { createHash } from 'node:crypto';

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

// The ONLY provider fields that reach a provider OG image (title + subtitle in
// scripts/og.mjs). Adding a field here means it also gets rendered there — and
// every change to these fields changes the image, so the fingerprint is exact
// with no false positives (e.g. a weekly last_verified bump does NOT stale an OG).
export const PROVIDER_OG_FIELDS = ['name', 'category', 'card_required', 'commercial_ok', 'openai_compatible'];

export const providerOgFingerprint = (p) => sha256(JSON.stringify(PROVIDER_OG_FIELDS.map((f) => p[f])));

// Per-collection OG — keep filters in sync with COLLECTIONS in scripts/build.mjs.
export const COLLS = [
  { slug: 'no-credit-card', title: 'Free LLM APIs · no credit card', filter: (p) => p.card_required === false },
  { slug: 'no-phone', title: 'Free LLM APIs · no phone', filter: (p) => p.phone_required === false },
  { slug: 'commercial-use', title: 'Free LLM APIs · commercial use', filter: (p) => p.commercial_ok === true },
  { slug: 'openai-compatible', title: 'OpenAI-compatible free APIs', filter: (p) => p.openai_compatible === true },
  { slug: 'always-free', title: 'Permanently free LLM APIs', filter: (p) => p.free_type === 'perpetual' },
  { slug: 'multimodal', title: 'Free multimodal AI APIs', filter: (p) => (p.modalities || []).some((m) => m !== 'text') },
];

// Guides and the model index share the same OG template. Keep filters in sync
// with GUIDES in scripts/build.mjs.
export const GUIDES = [
  { slug: 'free-llm-api-without-credit-card', title: 'Free LLM APIs · no credit card', filter: (p) => p.card_required === false && p.category === 'ongoing' },
  { slug: 'openai-compatible-free-apis', title: 'Free OpenAI-compatible APIs', filter: (p) => p.openai_compatible === true },
  { slug: 'free-llm-api-no-signup', title: 'Free APIs · no phone, no card', filter: (p) => p.card_required === false && p.phone_required === false && p.category === 'ongoing' },
  { slug: 'free-embeddings-apis', title: 'Free embeddings APIs for RAG', filter: (p) => (p.modalities || []).includes('embeddings') },
  { slug: 'free-speech-to-text-apis', title: 'Free speech APIs · STT & TTS', filter: (p) => (p.modalities || []).includes('audio') },
  { slug: 'free-image-generation-apis', title: 'Free image generation APIs', filter: (p) => (p.modalities || []).includes('image') },
  { slug: 'free-ocr-document-ai-apis', title: 'Free OCR & document AI APIs', filter: (p) => (p.modalities || []).includes('ocr') },
];

// The manifest every data-dependent OG must match: file name -> fingerprint of
// what it renders. Collections/guides/models render only a count, so their
// fingerprint is the count (a join+leave with the same net count renders the
// identical image — correctly not flagged).
export const buildOgManifest = (providers) => {
  const og = {};
  for (const c of COLLS) og[`collections/${c.slug}.png`] = sha256(String(providers.filter(c.filter).length));
  for (const g of GUIDES) og[`guides/${g.slug}.png`] = sha256(String(providers.filter(g.filter).length));
  const modelCount = providers.reduce((n, p) => n + (p.models_free || []).length, 0);
  const modelProviders = providers.filter((p) => p.models_free && p.models_free.length).length;
  og['models.png'] = sha256(`${modelCount}:${modelProviders}`);
  for (const p of providers) og[`p/${p.slug}.png`] = providerOgFingerprint(p);
  return og;
};
