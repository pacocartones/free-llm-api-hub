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
import { OG, ogAuraSpec, ogLimits, auraGridSvg, esc, wrap } from './og-art.mjs';
import { TAGLINE, taglineParts } from './brand.mjs';

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

// What a provider OG image draws (scripts/og.mjs, lib/og-art.mjs providerCardSvg): the name and the plan in words, its
// aura (modalities, disc or ring, dashed edge), up to three published limits and the "verified" stamp. The fingerprint
// hashes exactly that projection, so a change to any of it re-renders the image and nothing else does: the date of the
// last check is NOT drawn (the stamp says "verified · sourced"), so a weekly re-verification does not stale the image.
export const PROVIDER_OG_FIELDS = ['name', 'category', 'card_required', 'commercial_ok', 'openai_compatible', 'verified'];

const auraKey = (p) => { const s = ogAuraSpec(p); return [s.modalities, s.ongoing, s.unknown]; };
export const providerOgFingerprint = (p) => sha256(JSON.stringify([PROVIDER_OG_FIELDS.map((f) => p[f]), auraKey(p), ogLimits(p)]));

/** The members a collection or guide image draws: the first 16, in dataset order. */
export const ogMembers = (list) => list.slice(0, 16);
const membersFingerprint = (list) => sha256(JSON.stringify([list.length, ogMembers(list).map(auraKey)]));

export const COLLS = COLLECTIONS.map((c) => ({ ...c, title: c.ogTitle }));

// The home image is the editable template site/og.svg: counts in FIG markers (lib/figures.mjs), the tagline (lib/brand.mjs)
// between TAGLINE markers and the first 16 providers' auras between AURAS markers. Rendering is idempotent.
export const HOME_AURA_COUNT = 16;
const replaceBetween = (svg, name, content) => svg.replace(new RegExp(`(<!-- ${name} -->)[\\s\\S]*?(<!-- /${name} -->)`), (_m, a, b) => a + content + b);
export function homeTaglineSvg(tagline = TAGLINE) {
  const [lead, key] = taglineParts(tagline);
  const lines = wrap(lead, 15, key ? 2 : 3);
  const out = lines.map((l, i) => `<text x="78" y="${236 + i * 80}" fill="${OG.ink}" font-family="OG Display" font-size="84" letter-spacing="-1.5">${esc(l)}</text>`);
  if (key) out.push(`<text x="78" y="${236 + lines.length * 80}" fill="${OG.accent}" font-family="OG Display" font-size="84" letter-spacing="-1.5">${esc(key)}</text>`);
  return out.join('');
}
export const homeAurasSvg = (providers) => auraGridSvg(providers.slice(0, HOME_AURA_COUNT).map(ogAuraSpec), { x: 840, y: 150, w: 290, cols: 4, id: 'h' });
export const renderHomeOg = (svg, providers) =>
  replaceBetween(replaceBetween(injectInlineFigures(svg, providerFigures(providers)), 'TAGLINE', homeTaglineSvg()), 'AURAS', homeAurasSvg(providers));

// The list guides and the model index share the same OG template. Keep filters in sync
// with GUIDES in scripts/build.mjs (the long-form guides are in SECTION_OGS below).
export const GUIDES = [
  { slug: 'free-llm-api-without-credit-card', title: 'Free LLM APIs · no credit card', filter: (p) => p.verified === true && p.card_required === false && p.category === 'ongoing' },
  { slug: 'openai-compatible-free-apis', title: 'Free OpenAI-compatible APIs', filter: (p) => p.verified === true && p.openai_compatible === true },
  { slug: 'free-llm-api-no-signup', title: 'Free APIs · no phone, no card', filter: (p) => p.verified === true && p.card_required === false && p.phone_required === false && p.category === 'ongoing' },
  { slug: 'free-reranking-apis', title: 'Free reranking APIs for RAG', filter: (p) => p.verified === true && (p.modalities || []).includes('rerank') },
  { slug: 'free-vision-apis', title: 'Free vision APIs · image understanding', filter: (p) => p.verified === true && (p.modalities || []).includes('vision') },
];

// Section images for pages that used the site-wide og.png: the comparisons, the coding tools, the API, /not-free/, /embed/ and /find/. Their
// text is fixed (no count), so a comparison set or tool list that changes with the data never stales them; the
// fingerprint is the text itself, which lets check-og.mjs report a missing or outdated one.
export const SECTION_OGS = [
  { file: 'compare.png', label: 'COMPARE', title: 'Free LLM APIs side by side', subtitle: 'limits · card · phone · commercial use' },
  { file: 'coding-tools.png', label: 'CODING TOOLS', title: 'Free AI coding tools', subtitle: "each value with the tool's own sentence" },
  { file: 'api.png', label: 'API', title: 'Static JSON API', subtitle: 'versioned · CORS-open · no key' },
  { file: 'not-free.png', label: 'NOT FREE', title: 'LLM APIs that are not free', subtitle: "the provider's own words · dated · free alternatives" },
  { file: 'embed.png', label: 'USE THE DATA', title: 'Widget, badges, API, citation', subtitle: 'MIT · no key · no tracking' },
  { file: 'find.png', label: 'FIND MY FREE API', title: 'A shortlist of free APIs that fit you', subtitle: 'six questions · ranked · not confirmed is never yes' },
  // The long-form guides carry fixed text too (no count), so a dataset change never stales their image.
  ...LONG_GUIDES.map((g) => ({ file: `guides/${g.slug}.png`, label: 'GUIDE', title: g.ogTitle, subtitle: g.ogSubtitle })),
];

// The manifest every data-dependent OG must match: file name -> fingerprint of
// what it renders. Collections and guides render their count and the auras of
// their first 16 members, so that is their fingerprint; the model index renders
// only counts.
export const buildOgManifest = (providers, homeSvg = readFileSync(new URL('../../site/og.svg', import.meta.url), 'utf8')) => {
  const og = { '../og.png': sha256(renderHomeOg(homeSvg, providers)) };
  for (const c of COLLS) og[`collections/${c.slug}.png`] = membersFingerprint(providers.filter(c.filter));
  for (const g of GUIDES) og[`guides/${g.slug}.png`] = membersFingerprint(providers.filter(g.filter));
  const modelCount = providers.reduce((n, p) => n + (p.models_free || []).length, 0);
  const modelProviders = providers.filter((p) => p.models_free && p.models_free.length).length;
  og['models.png'] = sha256(`${modelCount}:${modelProviders}`);
  for (const p of providers) og[`p/${p.slug}.png`] = providerOgFingerprint(p);
  for (const o of SECTION_OGS) og[o.file] = sha256(JSON.stringify([o.label, o.title, o.subtitle]));
  return og;
};
