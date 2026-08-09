#!/usr/bin/env node
// Regenerates every derived artifact from the single source of truth: data/providers.json.
//   - README provider tables (between AUTOGEN markers)
//   - badge-freshness.json (root, for the shields.io endpoint badge)
//   - data/providers.csv and data/providers.yaml (portable exports)
//   - site/providers.json (+ csv/yaml) so the interactive site ships the data
// Zero dependencies. Run with: node scripts/build.mjs   (or `npm run build`)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { recScore, FLAG_PAIRS, SLA_DAYS, ageInDays, freshnessColor, freshnessBadge } from './lib/rules.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FRESH_DAYS = SLA_DAYS; // the freshness SLA, defined once in lib/rules.mjs

const data = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const providers = data.providers;

// ---------- freshness ----------
const today = new Date();
const isFresh = (p) => {
  if (!p.verified || !p.last_verified) return false;
  const a = ageInDays(p.last_verified, today);
  return a !== null && a <= FRESH_DAYS;
};
const total = providers.length;
const ongoing = providers.filter((p) => p.category === 'ongoing');
const trial = providers.filter((p) => p.category === 'trial');
const freshCount = providers.filter(isFresh).length;
const verifiedCount = providers.filter((p) => p.verified).length;

// ---------- markdown helpers ----------
// Escape a value for a GFM table cell. Backslashes first so we never
// double-escape; then the cell-breaking `|` and newlines; then `<`/`>` and
// brackets so a provider field coming from a community PR can inject neither
// raw HTML nor link syntax into the generated markdown.
const esc = (s) =>
  String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\[/g, '\\[')
    .replace(/]/g, '\\]')
    .replace(/\r?\n/g, ' ')
    .trim();

// Both sides of every tri-state that has a confirmed value get a pill, so absence
// means "not confirmed" and nothing else. `card_required: true` used to render
// nothing here — the one surface where it was silent, while the provider pages and
// the explorer both showed it — making a confirmed card wall look identical to an
// unknown one on the most-read table in the project.
function flags(p) {
  const parts = [];
  if (p.card_required === false) parts.push('💳 no card');
  if (p.card_required === true) parts.push('💳 card required');
  if (p.phone_required === false) parts.push('📵 no phone');
  if (p.phone_required === true) parts.push('📱 phone');
  if (p.commercial_ok === true) parts.push('🏢 commercial OK');
  if (p.commercial_ok === false) parts.push('🔬 eval only');
  if (p.openai_compatible === true) parts.push('🔌 OpenAI-compat');
  return parts.length ? `<br><sub>${parts.join(' · ')}</sub>` : '';
}

function nameCell(p) {
  const label = `**${esc(p.name)}**`;
  const linked = p.docs_url ? `**[${esc(p.name)}](${p.docs_url})**` : label;
  return `${linked}${flags(p)}`;
}

function verifiedCell(p) {
  return p.verified ? `✅ ${p.last_verified}` : '⚠️ unverified';
}

function ongoingTable(rows) {
  const head =
    '| Provider | What\'s free | Rate limits | The catch | Verified |\n' +
    '|---|---|---|---|---|';
  const body = rows
    .map(
      (p) =>
        `| ${nameCell(p)} | ${esc(p.free_tier)} | ${esc(p.rate_limits)} | ${esc(p.notes)} | ${verifiedCell(p)} |`
    )
    .join('\n');
  return `${head}\n${body}`;
}

function trialTable(rows) {
  const head =
    '| Provider | Credit | Models / notes | Expires | Verified |\n' +
    '|---|---|---|---|---|';
  const body = rows
    .map(
      (p) =>
        `| ${nameCell(p)} | ${esc(p.free_tier)} | ${esc(p.notes || p.rate_limits)} | ${esc(p.expires || '—')} | ${verifiedCell(p)} |`
    )
    .join('\n');
  return `${head}\n${body}`;
}

// ---------- editorial collections (generated from the data) ----------
const SITE = 'https://freellmapihub.com';

const COLLECTIONS = [
  {
    slug: 'no-credit-card',
    title: 'Free LLM APIs with no credit card',
    h1: 'Free LLM APIs with no credit card required',
    desc: 'LLM APIs you can start calling without entering a payment method — filtered live from a continuously-verified dataset.',
    intro: 'Every provider below offers free API access with **no card required** to get started (`card_required: false`, confirmed against their own docs). Rows where the requirement is unknown are excluded rather than assumed.',
    filter: (p) => p.card_required === false,
    guides: ['free-llm-api-without-credit-card', 'free-llm-api-no-signup'],
    faq: [
      { q: 'Can I use an LLM API for free without a credit card?', a: 'Yes — every provider on this page offers a free tier with no card required, confirmed against its own docs. You are limited by rate, not billing.' },
      { q: 'Will I be charged if I go over the free limit?', a: 'No. Without a payment method on file you get rate-limited (HTTP 429) rather than billed — you would have to add a card before any spend is possible.' },
    ],
  },
  {
    slug: 'no-phone',
    title: 'Free LLM APIs with no phone verification',
    h1: 'Free LLM APIs with no phone number required',
    desc: 'LLM APIs whose signup needs no SMS/phone verification — a live slice of a continuously-verified dataset.',
    intro: 'Providers you can sign up for **without phone verification** (`phone_required: false`). Groq, Mistral, SiliconFlow and NVIDIA are excluded here because they gate signup behind a phone number.',
    filter: (p) => p.phone_required === false,
    guides: ['free-llm-api-no-signup'],
  },
  {
    slug: 'commercial-use',
    title: 'Free LLM APIs for commercial use',
    h1: 'Free LLM APIs you can use commercially',
    desc: 'Free LLM API tiers that permit production/commercial use — not restricted to evaluation. Verified against each provider’s terms.',
    intro: 'Free tiers that **allow commercial/production use** (`commercial_ok: true`). Eval-only tiers (Cohere trial keys, NVIDIA NIM) are deliberately excluded — read their rows in the main list for the restriction.',
    filter: (p) => p.commercial_ok === true,
    guides: ['openai-compatible-free-apis', 'free-llm-api-without-credit-card'],
    faq: [
      { q: 'Which free LLM APIs allow commercial use?', a: 'Every provider on this page permits commercial/production use on its free tier (`commercial_ok: true`), confirmed against its own terms. Evaluation-only tiers are excluded.' },
      { q: 'Is a free tier safe to ship to production?', a: 'Check the rate limits and whether the free tier is renewing or a one-time credit — both are on each provider’s row. For steady load, a renewing free tier or a paid plan is safer than a trial credit.' },
    ],
  },
  {
    slug: 'openai-compatible',
    title: 'OpenAI-compatible free LLM APIs',
    h1: 'Free LLM APIs with an OpenAI-compatible endpoint',
    desc: 'Free LLM APIs that expose an OpenAI-compatible endpoint — point the OpenAI SDK at a new base_url and you are done.',
    intro: 'These providers expose an **OpenAI-compatible endpoint** (`openai_compatible: true`), so migrating is usually a one-line change: keep the OpenAI SDK, swap `base_url` and `api_key`. Grab each provider’s exact base URL from its linked docs.',
    filter: (p) => p.openai_compatible === true,
    quickstart: true,
    guides: ['openai-compatible-free-apis'],
  },
  {
    slug: 'always-free',
    title: 'Permanently free LLM APIs',
    h1: 'Permanently free LLM APIs (no trial clock)',
    desc: 'LLM APIs with models priced at $0 on an ongoing basis — no trial window counting down. Verified from a live dataset.',
    intro: 'Providers with models that are **free on a permanent basis** (`free_type: perpetual`) — not a trial credit that runs out. Rate limits still apply; check each row.',
    filter: (p) => p.free_type === 'perpetual',
  },
  {
    slug: 'multimodal',
    title: 'Free multimodal LLM APIs',
    h1: 'Free multimodal APIs — vision, audio, embeddings',
    desc: 'Free API tiers that go beyond text: vision, image, audio/speech, embeddings and rerank. A live slice of a verified dataset.',
    intro: 'Free tiers that reach **beyond plain text** — vision, image, audio/speech, embeddings or rerank on the free plan.',
    filter: (p) => (p.modalities || []).some((m) => m !== 'text'),
    guides: ['free-embeddings-apis', 'free-speech-to-text-apis', 'free-image-generation-apis', 'free-ocr-document-ai-apis'],
    faq: [
      { q: 'Are there free APIs for images, speech and embeddings — not just text?', a: 'Yes — the providers here reach beyond text on their free tier: vision, image generation, speech (STT/TTS), embeddings or rerank. See the modality-specific guides linked above.' },
      { q: 'Can one free API cover several modalities?', a: 'Some do — Google Gemini and Cloudflare Workers AI, for example, span text, vision, embeddings and more on a single free key. Each row lists the modalities that provider offers free.' },
    ],
  },
];

// SEO guides — intent-matched landing pages generated from the data. Declared
// here (before the provider loop) so provider pages can cross-link to them.
const GUIDES = [
  {
    slug: 'free-llm-api-without-credit-card',
    card: 'No credit card',
    blurb: 'Production-grade free tiers that never ask for a card.',
    h1: 'Free LLM APIs with no credit card required',
    title: 'Free LLM API — no credit card required · Free LLM API Hub',
    desc: 'Verified LLM APIs with a genuinely free tier that requires no credit card at signup. Rate limits and commercial-use terms compared.',
    lede: 'Yes — several production-grade LLM APIs give you a free tier without ever asking for a card.',
    intro: `<p>The fastest way to start building is an API that doesn't gate its free tier behind a payment method. Every provider below was verified to require <strong>no credit card</strong> at signup for its free access — so there's no risk of a surprise charge when you cross a limit; you simply get rate-limited.</p><p>Watch two things as you choose: the per-minute / per-day <em>rate limits</em> (fine for prototypes, tight for production) and whether <em>commercial use</em> is allowed on the free tier. Both are in the table.</p>`,
    filter: (p) => p.card_required === false && p.category === 'ongoing',
    query: '?cat=ongoing&nocard=1#explorer',
    faq: [
      { q: 'Can I use an LLM API for free without a credit card?', a: 'Yes. Providers such as Google Gemini, Groq, Cloudflare Workers AI and OpenRouter give a free tier with no card required — you are limited by rate, not billing, so you cannot be charged by surprise.' },
      { q: 'Will I be charged if I exceed the free limits?', a: 'No. On a no-card free tier you get rate-limited (HTTP 429) rather than billed. You would have to explicitly add a payment method before any spend is possible.' },
      { q: 'Are these free tiers okay for commercial use?', a: 'Some are, some are not — each row shows a commercial-use flag, confirmed against the provider’s own terms.' },
    ],
  },
  {
    slug: 'openai-compatible-free-apis',
    card: 'OpenAI-compatible',
    blurb: 'Keep your code — just swap base_url and key.',
    h1: 'Free OpenAI-compatible APIs (drop-in base_url)',
    title: 'Free OpenAI-compatible APIs — drop-in base_url · Free LLM API Hub',
    desc: 'Free LLM APIs that expose an OpenAI-compatible endpoint, so you only change base_url and the API key. Confirmed against each provider’s docs.',
    lede: 'Point the OpenAI SDK at a different base_url and keep all of your existing code.',
    intro: `<p>An OpenAI-compatible API exposes the same <code>/chat/completions</code> shape, so switching is usually a one-line change: swap <code>base_url</code> and the key. That makes these the lowest-friction way to move side projects off paid OpenAI usage, or to add a free fallback behind the same SDK.</p><p>Each provider's exact base URL is on its page, and the free models you can pass as <code>model</code> are in the <a href="../models/">model index</a>.</p>`,
    filter: (p) => p.openai_compatible === true,
    query: '#explorer',
    faq: [
      { q: 'What does OpenAI-compatible mean?', a: 'The API accepts the same request and response format as OpenAI’s <code>/chat/completions</code>, so the official OpenAI SDKs work by changing only <code>base_url</code> and the API key.' },
      { q: 'How do I switch my code to a free OpenAI-compatible API?', a: 'Set <code>base_url</code> to the provider’s endpoint (listed on each provider page), use its free API key, and pass one of its free model IDs as <code>model</code>.' },
      { q: 'Do all free LLM APIs support the OpenAI format?', a: 'No — this list is only the providers confirmed to expose an OpenAI-compatible endpoint against their own documentation.' },
    ],
  },
  {
    slug: 'free-llm-api-no-signup',
    card: 'No card, no phone',
    blurb: 'The lowest-friction keys: no card, no phone number.',
    h1: 'Free LLM APIs with no phone number (and no card)',
    title: 'Free LLM API — no phone, no credit card · Free LLM API Hub',
    desc: 'The lowest-friction free LLM APIs: no credit card and no phone verification. A couple need no account at all.',
    lede: 'The lowest-friction free APIs: no card, and no phone number either.',
    intro: `<p>Some free tiers add phone verification on top of the signup form. The providers here ask for <strong>neither a credit card nor a phone number</strong>, so you can go from zero to a working key in a couple of minutes.</p><p>A few — like Pollinations and AI Horde — don't even need an account for basic use. The trade-off is predictable: the fewer the gates, the tighter the rate limits.</p>`,
    filter: (p) => p.card_required === false && p.phone_required === false && p.category === 'ongoing',
    query: '?cat=ongoing&nocard=1&nophone=1#explorer',
    faq: [
      { q: 'Is there a free LLM API with no phone verification?', a: 'Yes — every provider here requires neither a credit card nor a phone number to obtain a key.' },
      { q: 'Can I call an LLM API with no account at all?', a: 'A few, such as Pollinations and AI Horde, allow anonymous or account-free use for basic requests, with tighter rate limits.' },
    ],
  },
  {
    slug: 'free-embeddings-apis',
    card: 'Embeddings / RAG',
    blurb: 'Free vector embeddings for search and RAG.',
    h1: 'Free embeddings APIs for search and RAG',
    title: 'Free embeddings APIs for RAG · Free LLM API Hub',
    desc: 'Verified APIs that expose embedding models on a free tier — for semantic search, RAG and clustering. Token allowances compared.',
    lede: 'Free vector embeddings for semantic search, RAG and clustering.',
    intro: `<p>Embeddings power semantic search, RAG and clustering — and you rarely need to pay for them at prototype scale. The providers below expose <strong>embedding models on a free tier</strong>, several with generous monthly token allowances.</p><p>Building RAG? Pair one of these with a free chat model (see the <a href="../models/">model index</a>), ideally behind the same OpenAI-compatible base URL.</p>`,
    filter: (p) => (p.modalities || []).includes('embeddings'),
    query: '#explorer',
    pick: 'jina-ai',
    faq: [
      { q: 'Is there a free embeddings API?', a: 'Yes — providers such as Jina AI, Cohere, Google Gemini and Cloudflare offer embedding models on a free tier, several with large monthly token allowances.' },
      { q: 'Can I build RAG for free?', a: 'For prototypes, yes: pair a free embeddings API with a free chat model, ideally behind the same OpenAI-compatible base URL.' },
    ],
  },
  {
    slug: 'free-speech-to-text-apis',
    card: 'Speech (STT/TTS)',
    blurb: 'Free transcription and text-to-speech tiers.',
    h1: 'Free speech APIs — transcription and text-to-speech',
    title: 'Free speech-to-text & TTS APIs · Free LLM API Hub',
    desc: 'Verified speech APIs with a free tier or sizeable starting credit — transcription (STT) and synthesis (TTS). Limits and catches compared.',
    lede: 'Free speech-to-text and text-to-speech APIs, from free monthly minutes to hundreds in credit.',
    intro: `<p>Audio APIs — transcription (STT) and synthesis (TTS) — often ship a real free tier or a sizeable one-time credit. The providers below offer <strong>free audio/speech access</strong>, from a few free hours a month to hundreds of dollars in starting balance.</p><p>Check the "catch" on each provider's page: some free speech tiers forbid commercial use or watermark the output.</p>`,
    filter: (p) => (p.modalities || []).includes('audio'),
    query: '#explorer',
    pick: 'groq',
    faq: [
      { q: 'Is there a free speech-to-text API?', a: 'Yes — Groq (Whisper), Cloudflare Workers AI and others offer free STT; several dedicated speech providers also grant a sizeable one-time credit.' },
      { q: 'Which free speech API is best for production?', a: 'Check each provider’s rate limits and whether commercial use is allowed — some free speech tiers are evaluation-only or watermark their output.' },
    ],
  },
  {
    slug: 'free-image-generation-apis',
    card: 'Image generation',
    blurb: 'Free text-to-image APIs — Flux, SDXL and more.',
    h1: 'Free image generation APIs',
    title: 'Free image generation APIs (Flux, SDXL) · Free LLM API Hub',
    desc: 'Verified APIs that generate images on a free tier or starting credit — Flux, Stable Diffusion, SDXL and more. Watermarks and commercial terms compared.',
    lede: 'Free text-to-image APIs, from no-signup endpoints to first-party models on a starting credit.',
    intro: `<p>Text-to-image is one of the easiest modalities to try for free: several providers host <strong>Flux, Stable Diffusion and SDXL</strong> behind a simple API — some with no signup at all, others with a small starting credit. Every provider below was verified to offer free image generation against its own docs.</p><p>Watch two catches on each provider's page: whether the free output is <em>watermarked</em>, and whether <em>commercial use</em> is allowed — both vary a lot across free image tiers.</p>`,
    filter: (p) => (p.modalities || []).includes('image'),
    query: '#explorer',
    pick: 'pollinations',
    faq: [
      { q: 'Is there a free image generation API?', a: 'Yes — Pollinations and AI Horde offer free, no-signup image generation, while Runware, Photoroom and others give a starting credit for first-party Flux/SDXL models.' },
      { q: 'Can I use free AI-generated images commercially?', a: 'Sometimes — it depends on the provider and whether the output is watermarked. Each row flags commercial use, confirmed against the provider’s terms.' },
      { q: 'Which free image API has no watermark?', a: 'Free registration removes the watermark on Pollinations, and providers such as Runware return unwatermarked output on their starting credit. Check the catch on each provider page.' },
    ],
  },
  {
    slug: 'free-ocr-document-ai-apis',
    card: 'OCR / document AI',
    blurb: 'Free OCR and document-parsing APIs for RAG.',
    h1: 'Free OCR and document-parsing APIs',
    title: 'Free OCR & document AI APIs · Free LLM API Hub',
    desc: 'Verified APIs that do OCR and document parsing on a free tier — extract text, tables and key-values from PDFs and images for RAG. Page limits compared.',
    lede: 'Free OCR and document-AI APIs to turn PDFs and images into structured, LLM-ready text.',
    intro: `<p>Before a document can go into a RAG pipeline it has to be parsed — OCR, layout, tables and key-values. The providers below offer <strong>document AI on a free tier</strong>, several with thousands of free pages a month that renew.</p><p>Pair one of these with a <a href="free-embeddings-apis.html">free embeddings API</a> and a free chat model to build a full document-QA stack at zero cost for prototypes.</p>`,
    filter: (p) => (p.modalities || []).includes('ocr'),
    query: '#explorer',
    pick: 'unstructured',
    faq: [
      { q: 'Is there a free OCR API?', a: 'Yes — OCR.space, Unstructured, Nutrient and LlamaParse all offer free OCR / document parsing, several with thousands of pages a month.' },
      { q: 'What’s the best free API to parse PDFs for RAG?', a: 'Unstructured and LlamaParse are built specifically to turn documents into clean, chunked text for RAG, both on a renewing monthly free tier.' },
      { q: 'Can free OCR handle tables and handwriting?', a: 'Some do — providers such as Nutrient extract tables, key-values and handwriting. Check each provider page for the exact free-tier capabilities.' },
    ],
  },
];

const collRows = (c) => providers.filter(c.filter);
const typeLabel = (p) => (p.category === 'ongoing' ? 'Ongoing' : 'Trial');

// Markdown table for a collection. With opts.baseUrl, the 2nd column shows the
// OpenAI base URL instead of the tier type (used on the openai-compatible page).
function collectionTableMd(rows, opts = {}) {
  const bu = opts.baseUrl;
  const head = bu
    ? "| Provider | OpenAI base URL | What's free | The catch | Verified |\n|---|---|---|---|---|"
    : "| Provider | Type | What's free | The catch | Verified |\n|---|---|---|---|---|";
  const body = rows
    .map((p) => {
      const col2 = bu ? (p.openai_base_url ? `\`${esc(p.openai_base_url)}\`` : '_see docs_') : typeLabel(p);
      return `| ${nameCell(p)} | ${col2} | ${esc(p.free_tier)} | ${esc(p.notes)} | ${verifiedCell(p)} |`;
    })
    .join('\n');
  return `${head}\n${body}`;
}

// Concrete, runnable example drawn from the data (Groq: verified, no card, well-known free models).
const QUICKSTART_EXAMPLE = providers.find((p) => p.slug === 'groq' && p.openai_base_url) || providers.find((p) => p.openai_base_url);
const QS_BASE = QUICKSTART_EXAMPLE ? QUICKSTART_EXAMPLE.openai_base_url : 'https://<provider-base-url>/v1';
const QS_NAME = QUICKSTART_EXAMPLE ? QUICKSTART_EXAMPLE.name : 'the provider';
const QS_MODEL = QUICKSTART_EXAMPLE && QUICKSTART_EXAMPLE.slug === 'groq' ? 'llama-3.1-8b-instant' : '<a-free-model>';

const QUICKSTART_MD = `## Quickstart — reuse the OpenAI SDK

Most of these accept the OpenAI SDK with two changes: point \`base_url\` at the provider and use its free key. The base URLs are in the table above; grab a key from each provider's console.

### Python — example: ${QS_NAME}

\`\`\`python
from openai import OpenAI

client = OpenAI(base_url="${QS_BASE}", api_key="<YOUR_FREE_API_KEY>")
resp = client.chat.completions.create(
    model="${QS_MODEL}",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)
\`\`\`

### curl

\`\`\`bash
curl ${QS_BASE}/chat/completions \\
  -H "Authorization: Bearer $YOUR_FREE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${QS_MODEL}", "messages": [{"role": "user", "content": "Hello!"}]}'
\`\`\`

Swap the \`base_url\` (and a model that provider offers free) for any row above.
`;

// ---------- HTML page shell (shared by collection pages) ----------
const htmlEsc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Strip HTML tags for plain-text contexts (JSON-LD answers, meta descriptions).
// A single pass of /<[^>]+>/ is incomplete — fragments like <<script> survive it —
// so iterate until the string stops changing (fixed point).
const stripTags = (s) => {
  let out = String(s ?? '');
  let prev;
  do {
    prev = out;
    out = out.replace(/<[^>]*>/g, '');
  } while (out !== prev);
  return out;
};

function collectionTableHtml(rows, opts = {}) {
  const bu = opts.baseUrl;
  const flagsHtml = (p) => {
    const parts = [];
    if (p.card_required === false) parts.push(`${IC('ic-nocard')}no card`);
    if (p.card_required === true) parts.push(`${IC('ic-card')}card`);
    if (p.phone_required === false) parts.push(`${IC('ic-nophone')}no phone`);
    if (p.phone_required === true) parts.push(`${IC('ic-phone')}phone`);
    if (p.commercial_ok === true) parts.push(`${IC('ic-building')}commercial OK`);
    if (p.commercial_ok === false) parts.push(`${IC('ic-flask')}eval only`);
    if (p.openai_compatible === true) parts.push(`${IC('ic-code')}OpenAI-compat`);
    return parts.length ? `<div class="flags">${parts.map((t) => `<span>${t}</span>`).join('')}</div>` : '';
  };
  const col2Head = bu ? 'OpenAI base URL' : 'Type';
  const rowsHtml = rows
    .map((p) => {
      const name = p.docs_url
        ? `<a href="${htmlEsc(p.docs_url)}" target="_blank" rel="noopener">${htmlEsc(p.name)}</a>`
        : htmlEsc(p.name);
      const v = p.verified
        ? `<span class="v ok">${IC('ic-check')} ${htmlEsc(p.last_verified)}</span>`
        : `<span class="v warn">${IC('ic-warn')} unverified</span>`;
      const col2 = bu
        ? (p.openai_base_url ? `<code>${htmlEsc(p.openai_base_url)}</code>` : '<span class="notes">see docs</span>')
        : `<span class="type">${typeLabel(p)}</span>`;
      return `<tr><td class="name">${name}${flagsHtml(p)}</td><td>${col2}</td><td>${htmlEsc(p.free_tier)}</td><td class="notes">${htmlEsc(p.notes)}</td><td>${v}</td></tr>`;
    })
    .join('\n');
  return `<table><thead><tr><th>Provider</th><th>${col2Head}</th><th>What's free</th><th>The catch</th><th>Verified</th></tr></thead><tbody>\n${rowsHtml}\n</tbody></table>`;
}

// Shared chrome for generated pages (collection pages live one level below site root → '../').
const GH_ICON = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 014 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
const REPO = 'https://github.com/pacocartones/free-llm-api-hub';
const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<symbol id="logo" viewBox="0 0 32 32" fill="none"><rect x="2" y="2" width="28" height="28" rx="8" stroke="currentColor" stroke-width="2" stroke-opacity=".35"/><path d="M9 11 L14 16 L9 21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><rect x="16.5" y="19.4" width="7" height="2.4" rx="1.2" fill="currentColor"/></symbol>
<symbol id="ic-card" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="3.5" width="13" height="9" rx="2"/><path d="M1.5 6.5H14.5"/></symbol>
<symbol id="ic-nocard" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="3.5" width="13" height="9" rx="2"/><path d="M1.5 6.5H14.5"/><path d="M2.6 2 L13.4 14"/></symbol>
<symbol id="ic-phone" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="4.5" y="1.5" width="7" height="13" rx="1.6"/><path d="M7 12.3H9"/></symbol>
<symbol id="ic-nophone" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="4.5" y="1.5" width="7" height="13" rx="1.6"/><path d="M7 12.3H9"/><path d="M2.6 2 L13.4 14"/></symbol>
<symbol id="ic-building" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="3" y="2" width="10" height="12" rx="1"/><path d="M6 5H6.01M10 5H10.01M6 8H6.01M10 8H10.01M6.5 14V11.5H9.5V14"/></symbol>
<symbol id="ic-flask" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M6.2 2V6L3.2 12.2A1 1 0 0 0 4.1 13.7H11.9A1 1 0 0 0 12.8 12.2L9.8 6V2"/><path d="M5 2H11M5.2 9H10.8"/></symbol>
<symbol id="ic-code" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4"/></symbol>
<symbol id="ic-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8.5 6 12l7.5-8"/></symbol>
<symbol id="ic-warn" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5 15 14H1z"/><path d="M8 6.5V9.5M8 11.6V11.7"/></symbol>
<symbol id="ic-doc" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 1.5h5l3 3v10H4z"/><path d="M9 1.5V5h3M6 8.5h4M6 11h3"/></symbol>
<symbol id="ic-link" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6.6 9.4 9.4 6.6"/><path d="M7 4.6 8.4 3.2a2.4 2.4 0 0 1 3.4 3.4L10.4 8"/><path d="M9 11.4 7.6 12.8a2.4 2.4 0 0 1-3.4-3.4L5.6 8"/></symbol>
<symbol id="ic-gauge" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12a5.5 5.5 0 1 1 11 0"/><path d="M8 12l3-3.2"/></symbol>
<symbol id="ic-flag" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.5V2"/><path d="M4 2.6h7.5L10 5.3l1.5 2.7H4"/></symbol>
<symbol id="ic-database" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3.5c0 1.1-2.2 2-5 2s-5-.9-5-2 2.2-2 5-2 5 .9 5 2z"/><path d="M3 3.5v9c0 1.1 2.2 2 5 2s5-.9 5-2v-9"/><path d="M3 8c0 1.1 2.2 2 5 2s5-.9 5-2"/></symbol>
<symbol id="ic-refresh" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13.2 7.2a5.3 5.3 0 1 0-.3 3"/><path d="M13.5 2.4V5.5H10.4"/></symbol>
<symbol id="ic-clock" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 4.6V8l2.4 1.5"/></symbol>
<symbol id="ic-shield" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5 13 3.4v4c0 3.4-2.1 5.7-5 7-2.9-1.3-5-3.6-5-7v-4z"/><path d="M5.6 8 7.4 9.8 10.5 6.2"/></symbol>
<symbol id="ic-menu" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/></symbol>
<symbol id="ic-close" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></symbol>
<symbol id="ic-home" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.3 8 2.8l5.5 4.5V13a.8.8 0 0 1-.8.8H3.3a.8.8 0 0 1-.8-.8z"/><path d="M6.4 13.8V9.4h3.2v4.4"/></symbol>
<symbol id="ic-cube" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.9 13.6 5v6L8 14.1 2.4 11V5z"/><path d="M2.4 5 8 8.1 13.6 5M8 8.1V14.1"/></symbol>
<symbol id="ic-book" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.6C6.5 2.5 4 2.5 2.5 3.1v9.4C4 11.9 6.5 11.9 8 13c1.5-1.1 4-1.1 5.5-.5V3.1C12 2.5 9.5 2.5 8 3.6z"/><path d="M8 3.6v9.4"/></symbol>
<symbol id="ic-grid" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="2.3" y="2.3" width="4.6" height="4.6" rx="1"/><rect x="9.1" y="2.3" width="4.6" height="4.6" rx="1"/><rect x="2.3" y="9.1" width="4.6" height="4.6" rx="1"/><rect x="9.1" y="9.1" width="4.6" height="4.6" rx="1"/></symbol>
<symbol id="ic-rocket" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.6 11.4 6 7.8c.3-3.6 2.2-5.6 5.6-6.2.6 3.4-.4 5.7-3 7.4z"/><path d="M6 8.2C4 8.6 3 11 3 13c2 0 4.4-1 4.8-3"/><circle cx="9.8" cy="6.2" r="1"/></symbol>
<symbol id="ic-cap" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.8 1.6 5.8 8 8.8l6.4-3z"/><path d="M4.4 7.4v3.1c0 1 1.6 1.9 3.6 1.9s3.6-.9 3.6-1.9V7.4M14.4 5.8v3.4"/></symbol>
</defs></svg>`;
const IC = (id) => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;

const siteHeader = (p) => `<header class="site-header"><div class="wrap header-inner">
<a class="brand" href="${p}" aria-label="Free LLM API Hub — home"><svg class="logo-mark"><use href="#logo"/></svg><span class="brand-name">Free LLM API <span class="grad">Hub</span></span></a>
<nav class="nav" id="primary-nav" aria-label="Primary"><a href="${p}">${IC('ic-home')}Home</a><a href="${p}models/">${IC('ic-cube')}Models</a><a href="${p}guides/">${IC('ic-book')}Guides</a><a href="${p}collections/">${IC('ic-grid')}Collections</a><a href="${p}programs/startups.html">${IC('ic-rocket')}Startup credits</a><a href="${p}programs/research.html">${IC('ic-cap')}Student credits</a></nav>
<div class="header-actions">
<button class="icon-btn nav-toggle" id="navToggle" aria-label="Open menu" aria-expanded="false" aria-controls="primary-nav"><svg class="i menu" aria-hidden="true"><use href="#ic-menu"/></svg><svg class="i close" aria-hidden="true"><use href="#ic-close"/></svg></button>
<a class="icon-btn" href="${REPO}" target="_blank" rel="noopener" aria-label="Star on GitHub">${GH_ICON}<span class="star-count" data-stars>★</span></a>
<button class="icon-btn theme-toggle" id="themeToggle" aria-label="Toggle light and dark theme" title="Toggle theme"><svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><svg class="moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg></button>
</div></div></header>`;

const siteFooter = (p) => `<footer class="site-footer"><div class="wrap footer-top">
<div class="footer-brand"><a class="foot-brand-link" href="${p}" aria-label="Free LLM API Hub — home"><svg class="logo-mark"><use href="#logo"/></svg><span class="brand-name">Free LLM API <span class="grad">Hub</span></span></a><p>A continuously-verified, machine-readable dataset of free LLM &amp; AI-model APIs and trial credits for developers.</p><a class="star-btn" href="${REPO}" target="_blank" rel="noopener" aria-label="Star free-llm-api-hub on GitHub"><span class="sb-label">${GH_ICON} Star on GitHub</span><span class="sb-count" data-stars>★</span></a></div>
<div class="footer-col"><h4>Explore</h4><a href="${p}#explorer">Interactive explorer</a><a href="${p}models/">Free model index</a><a href="${p}guides/">Guides</a><a href="${p}collections/">Collections</a><a href="${p}programs/startups.html">Startup credits</a><a href="${p}programs/research.html">Student &amp; research credits</a><a href="${p}updates.html">Updates</a><a href="${REPO}#notably-not-free">Notably NOT free</a></div>
<div class="footer-col"><h4>Data</h4><a href="${p}providers.json">providers.json</a><a href="${p}api/">JSON API</a><a href="${p}llms.txt">llms.txt</a><a href="${p}providers.csv">CSV export</a><a href="${p}providers.yaml">YAML export</a><a href="${REPO}/blob/main/data/schema.json">JSON Schema</a></div>
<div class="footer-col"><h4>Project</h4><a href="${REPO}/blob/main/docs/methodology.md">Methodology</a><a href="${REPO}/blob/main/CONTRIBUTING.md">Contributing</a><a href="${REPO}/blob/main/CHANGELOG.md">Changelog</a><a href="${REPO}">GitHub ★</a></div>
</div><div class="wrap footer-bottom"><p>Independent, community-maintained — not affiliated with any provider listed. Terms change without notice; always confirm against each provider's own docs. MIT licensed.</p><p class="foot-legal"><a href="${p}legal/privacy.html">Privacy</a> · <a href="${p}legal/terms.html">Terms</a></p><p class="foot-email"><a href="mailto:admin@freellmapihub.com">admin@freellmapihub.com</a></p></div></footer>`;

// Full page wrapper for generated (collection) pages. `p` is the path prefix to the site root.
// Theme guard — runs before first paint to avoid the white flash. ONE source, shared by
// htmlPage() (every generated page) and site/index.html (injected via AUTOGEN:themeguard).
const THEME_GUARD = `<script>(function(){try{var t=localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>`;

// Content-Security-Policy (all pages, injected into index.html via AUTOGEN:csp and hard-copied
// in 404.html). script-src pins our two inline scripts by hash — the theme guard (every page)
// and the path read-out (404.html only) — so no other inline or injected script can run;
// everything else is 'self' (site.js, explorer.js, shared-rules.js, widget.js). connect-src
// allows the star count (api.github.com) and explorer.js's data fallback (raw.githubusercontent).
// No default-src/style-src on purpose: inline style="" attributes and the 404 <style> stay valid.
// If you edit THEME_GUARD or 404.html's inline scripts, recompute these hashes or the page breaks silently.
const CSP = `<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'sha256-r3FnVnP9W/uaNhK9XkZqH3GIfK4TudOQGYTwoNIjGR4=' 'sha256-YzEhxvq2BwovGsg/RCjKkQdwf+LZmTjIkiQcjXCZMHc='; connect-src 'self' https://api.github.com https://raw.githubusercontent.com; object-src 'none'; base-uri 'self'">`;

function htmlPage({ title, desc, canonical, main, jsonld, prefix = '../', noindex = false, ogImage = `${SITE}/og.png` }) {
  // jsonld carries provider names straight from the dataset; writing "<" as
  // the JSON unicode escape (backslash-u-003c) keeps a "</script>" in the
  // data from ever closing the block.
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${htmlEsc(title)}</title>
<meta name="description" content="${htmlEsc(desc)}">${noindex ? '\n<meta name="robots" content="noindex">' : ''}
${CSP}
${THEME_GUARD}
<link rel="canonical" href="${htmlEsc(canonical)}">
<link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
<link rel="preload" href="${prefix}fonts/jetbrains-mono-700.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preconnect" href="https://api.github.com" crossorigin>
<meta name="theme-color" content="#0a0d0b">
<meta name="color-scheme" content="dark light">
<meta property="og:title" content="${htmlEsc(title)}">
<meta property="og:description" content="${htmlEsc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${htmlEsc(canonical)}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ogImage}">
<link rel="alternate" type="application/rss+xml" title="Free LLM API Hub — updates" href="${prefix}feed.xml">
<link rel="stylesheet" href="${prefix}styles.css">
${jsonld ? `<script type="application/ld+json">${jsonld.replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${SPRITE}
${siteHeader(prefix)}
${main}
${siteFooter(prefix)}
<script src="${prefix}site.js"></script>
</body>
</html>
`;
}

// Kept deterministic from the data (no time-sensitive term) so PR CI never flakes on date drift.
// The decaying "verified in the last N days" number lives in the badge, which the scheduled job refreshes.
const statsLine =
  `**${total} providers** tracked · ${ongoing.length} ongoing free tiers · ${trial.length} trial credits · ` +
  `**${verifiedCount}/${total}** independently verified against the provider's own docs`;

// ---------- inject into README ----------
function inject(md, name, content) {
  const re = new RegExp(
    `(<!-- AUTOGEN:${name}:start -->)([\\s\\S]*?)(<!-- AUTOGEN:${name}:end -->)`
  );
  if (!re.test(md)) throw new Error(`Missing AUTOGEN markers for "${name}" in README.md`);
  // Use a replacement FUNCTION: the injected content contains literal '$1', '$0 cost', etc.
  // which String.replace would otherwise interpret as capture-group references.
  return md.replace(re, (_m, start, _mid, end) => `${start}\n${content}\n${end}`);
}

const BLURB = {
  'no-credit-card': 'start without a payment method',
  'no-phone': 'no SMS/phone verification',
  'commercial-use': 'safe to ship, not eval-only',
  'openai-compatible': 'drop-in OpenAI SDK swap',
  'always-free': '$0 models, no trial clock',
  'multimodal': 'vision, audio, embeddings',
};
const collectionsIndexMd = COLLECTIONS.map((c) => {
  const n = collRows(c).length;
  return `- **[${c.title}](collections/${c.slug}.md)** (${n}) — ${BLURB[c.slug]} · [live page ↗](${SITE}/collections/${c.slug}.html)`;
}).join('\n');

// "What's covered" — modality breakdown, generated from the data so it never goes stale.
const MODALITY_LABELS = {
  text: 'Text / LLM', audio: 'Speech (STT / TTS)', image: 'Image generation',
  vision: 'Vision', embeddings: 'Embeddings', rerank: 'Rerank', ocr: 'OCR / documents',
};
const coverageRows = Object.entries(MODALITY_LABELS)
  .map(([m, label]) => {
    const ps = providers.filter((p) => (p.modalities || []).includes(m));
    return { label, count: ps.length, ex: ps.slice(0, 3).map((p) => p.name.replace(/\s*\(.*\)/, '')) };
  })
  .filter((r) => r.count > 0)
  .sort((a, b) => b.count - a.count);
const coverageTable =
  '| Category | Providers | Examples |\n|---|---|---|\n' +
  coverageRows.map((r) => `| **${r.label}** | ${r.count} | ${r.ex.join(', ')} |`).join('\n');

let readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
readme = inject(readme, 'stats', statsLine);
readme = inject(readme, 'coverage', coverageTable);
readme = inject(readme, 'collections', collectionsIndexMd);
readme = inject(readme, 'ongoing', ongoingTable(ongoing));
readme = inject(readme, 'trial', trialTable(trial));
writeFileSync(join(ROOT, 'README.md'), readme);

// ---------- keep CITATION.cff pinned to the dataset it describes ----------
// The citation metadata is derived, not hand-maintained: it drifted to 2.3.0
// while the dataset shipped 2.6.0. Same rule as everything else here.
const citationPath = join(ROOT, 'CITATION.cff');
const citation = readFileSync(citationPath, 'utf8')
  .replace(/^version: .*$/m, `version: "${data.version}"`)
  .replace(/^date-released: .*$/m, `date-released: "${data.generated}"`);
writeFileSync(citationPath, citation);

// ---------- server-render the homepage explorer (SEO + no-JS + instant paint) ----------
const explorerFlagsMini = (p) => FLAG_PAIRS.filter(([k, v]) => p[k] === v)
  .map(([, , ic, t]) => `<span class="fmini-i" title="${t}" aria-label="${t}">${IC(ic)}</span>`).join('');
const explorerRowsHtml = (rows) => rows.map((p) => {
  const best = p.best_for ? `<div class="best">${htmlEsc(p.best_for)}</div>` : '';
  const v = p.verified ? `<span class="badge b-ok">${IC('ic-check')} ${htmlEsc(p.last_verified)}</span>` : `<span class="badge b-warn">${IC('ic-warn')} unverified</span>`;
  return `<tr>` +
    `<td class="name" data-label="API"><a href="p/${p.slug}.html">${htmlEsc(p.name)}</a>${best}</td>` +
    `<td data-label="Type"><span class="badge ${p.category === 'ongoing' ? 'b-ongoing' : 'b-trial'}">${p.category === 'ongoing' ? 'Ongoing' : 'Trial'}</span><div class="fmini">${explorerFlagsMini(p)}</div></td>` +
    `<td data-label="What's free">${htmlEsc(p.free_tier)}</td>` +
    `<td class="notes" data-label="The catch">${htmlEsc(p.notes || '')}</td>` +
    `<td data-label="Verified">${v}</td></tr>`;
}).join('\n');

// Emit the browser's copy of the shared rules (recScore + FLAG_PAIRS) straight
// from the one source in scripts/lib/rules.mjs, so the client explorer never
// keeps its own and can never drift from this server render.
const sharedRulesJs = `// AUTO-GENERATED by scripts/build.mjs from scripts/lib/rules.mjs — do not edit.
window.FLLM_RULES = {
  recScore: ${recScore.toString()},
  FLAG_PAIRS: ${JSON.stringify(FLAG_PAIRS)}
};
`;
writeFileSync(join(ROOT, 'site/shared-rules.js'), sharedRulesJs);

const homeRows = explorerRowsHtml([...providers].sort((a, b) => recScore(b) - recScore(a) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)));
// env_key is operational (which secret to use) — strip it from anything public.
const publicProviders = providers.map(({ env_key, ...rest }) => rest);
const inlineData = `<script type="application/json" id="providers-data">${JSON.stringify({ providers: publicProviders }).replace(/</g, '\\u003c')}</script>`;
let indexHtml = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
indexHtml = inject(indexHtml, 'csp', CSP);
indexHtml = inject(indexHtml, 'themeguard', THEME_GUARD);
indexHtml = inject(indexHtml, 'rows', homeRows);
indexHtml = inject(indexHtml, 'data', inlineData);
writeFileSync(join(ROOT, 'site/index.html'), indexHtml);

// ---------- badge ----------
// Graded on the oldest verified entry (see freshnessBadge in lib/rules.mjs):
// the share-inside-the-SLA number it replaced could not reach amber or red
// without months of total silence, so it reported liveness, not freshness.
const { badge, oldest: oldestAge, median: medianAge } = freshnessBadge(providers, today);
const color = badge.color;
writeFileSync(join(ROOT, 'badge-freshness.json'), JSON.stringify(badge, null, 2) + '\n');

// ---------- exports (CSV / YAML) ----------
const COLS = [
  'slug', 'name', 'category', 'free_type', 'free_tier', 'rate_limits', 'notes',
  'best_for', 'modalities', 'models_free', 'expires', 'docs_url', 'phone_required',
  'card_required', 'commercial_ok', 'openai_compatible', 'openai_base_url', 'verified', 'last_verified',
];

const csvCell = (v) => {
  if (v === null || v === undefined) v = '';
  if (Array.isArray(v)) v = v.join(';');
  v = String(v);
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
const csv = [COLS.join(','), ...providers.map((p) => COLS.map((c) => csvCell(p[c])).join(','))].join('\n') + '\n';

const yamlScalar = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  return JSON.stringify(String(v));
};
let yaml = `# Generated from data/providers.json — do not edit by hand.\nproviders:\n`;
for (const p of providers) {
  yaml += COLS.map((c, i) => {
    const prefix = i === 0 ? '  - ' : '    ';
    if (Array.isArray(p[c])) return `${prefix}${c}: [${p[c].map((m) => JSON.stringify(m)).join(', ')}]`;
    return `${prefix}${c}: ${yamlScalar(p[c])}`;
  }).join('\n') + '\n';
}

writeFileSync(join(ROOT, 'data/providers.csv'), csv);
writeFileSync(join(ROOT, 'data/providers.yaml'), yaml);

// ---------- ship data with the site ----------
mkdirSync(join(ROOT, 'site'), { recursive: true });
writeFileSync(join(ROOT, 'site/providers.json'), JSON.stringify({ ...data, providers: publicProviders }, null, 2) + '\n');
writeFileSync(join(ROOT, 'site/providers.csv'), csv);
writeFileSync(join(ROOT, 'site/providers.yaml'), yaml);

// ---------- generate collection pages (repo markdown + live HTML) ----------
mkdirSync(join(ROOT, 'collections'), { recursive: true });
mkdirSync(join(ROOT, 'site/collections'), { recursive: true });

const GEN_NOTE = '<!-- Generated from data/providers.json by scripts/build.mjs — do not edit by hand. -->';
const collNavMd = COLLECTIONS.map((c) => `[${c.title}](${c.slug}.md)`).join(' · ');

for (const c of COLLECTIONS) {
  const rows = collRows(c);
  const nav = COLLECTIONS.map(
    (o) => `<a href="${o.slug}.html"${o.slug === c.slug ? ' class="active" aria-current="page"' : ''}>${htmlEsc(o.title)}</a>`
  ).join('');
  const guideLinks = (c.guides || [])
    .map((s) => { const gx = GUIDES.find((x) => x.slug === s); return gx ? `<a href="../guides/${gx.slug}.html">${htmlEsc(gx.card)}</a>` : ''; })
    .filter(Boolean).join('');
  const collFaqHtml = (c.faq && c.faq.length)
    ? `<h2>FAQ</h2>` + c.faq.map((f) => `<div class="faq-item"><h3>${htmlEsc(f.q)}</h3><p>${f.a}</p></div>`).join('')
    : '';

  // --- repo markdown ---
  const md =
    `${GEN_NOTE}\n\n# ${c.h1}\n\n${c.desc}\n\n` +
    `[← All collections](README.md) · [Interactive explorer ↗](${SITE}/) · [Main list](../README.md)\n\n` +
    `${c.intro}\n\n**${rows.length} of ${total} tracked providers** match.\n\n` +
    `${collectionTableMd(rows, { baseUrl: c.quickstart })}\n\n` +
    (c.quickstart ? `${QUICKSTART_MD}\n` : '') +
    `---\n\nOther collections: ${collNavMd}\n\n` +
    `_Generated from [providers.json](../data/providers.json). Terms change without notice — always confirm against each provider's own docs._\n`;
  writeFileSync(join(ROOT, `collections/${c.slug}.md`), md);

  // --- live HTML page ---
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: c.h1,
        description: c.desc,
        numberOfItems: rows.length,
        itemListElement: rows.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.name, url: p.docs_url || undefined })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Free LLM API Hub', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Collections', item: `${SITE}/collections/` },
          { '@type': 'ListItem', position: 3, name: c.title, item: `${SITE}/collections/${c.slug}.html` },
        ],
      },
      ...(c.faq && c.faq.length ? [{
        '@type': 'FAQPage',
        mainEntity: c.faq.map((f) => ({
          '@type': 'Question', name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: stripTags(f.a) },
        })),
      }] : []),
    ],
  });
  const introHtml = htmlEsc(c.intro).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const main =
    `<section class="page-hero"><div class="wrap">` +
    `<nav class="crumbs"><a href="../">Home</a> / <a href="./">Collections</a> / ${htmlEsc(c.title)}</nav>` +
    `<h1>${htmlEsc(c.h1)}</h1><p class="lede">${htmlEsc(c.desc)}</p>` +
    `<nav class="colls">${nav}</nav></div></section>` +
    `<main id="main"><div class="wrap prose">` +
    `<p>${introHtml}</p>` +
    `<p class="count"><strong>${rows.length} of ${total}</strong> tracked providers match.</p>` +
    `${collectionTableHtml(rows, { baseUrl: c.quickstart })}` +
    (c.quickstart
      ? `<h2>Quickstart — reuse the OpenAI SDK</h2><p class="count">Point <code>base_url</code> at the provider (URLs in the table above) and use its free key. Example: ${htmlEsc(QS_NAME)}.</p><pre><code>from openai import OpenAI

client = OpenAI(base_url="${htmlEsc(QS_BASE)}", api_key="&lt;YOUR_FREE_API_KEY&gt;")
resp = client.chat.completions.create(
    model="${htmlEsc(QS_MODEL)}",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)</code></pre><pre><code>curl ${htmlEsc(QS_BASE)}/chat/completions \\
  -H "Authorization: Bearer $YOUR_FREE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${htmlEsc(QS_MODEL)}", "messages": [{"role": "user", "content": "Hello!"}]}'</code></pre>`
      : '') +
    collFaqHtml +
    (guideLinks ? `<h2>Related guides</h2><nav class="colls">${guideLinks}</nav>` : '') +
    `</div></main>`;
  writeFileSync(
    join(ROOT, `site/collections/${c.slug}.html`),
    htmlPage({ title: `${c.title} · Free LLM API Hub`, desc: c.desc, canonical: `${SITE}/collections/${c.slug}.html`, main, jsonld, ogImage: `${SITE}/og/collections/${c.slug}.png` })
  );
}

// --- collections hub (repo markdown) ---
const hubMd =
  `${GEN_NOTE}\n\n# Collections\n\n` +
  `Curated, always-current slices of the [dataset](../data/providers.json) — each one filters the list by a single constraint a builder actually has. Generated on every change; each has a [live web page](${SITE}/collections/).\n\n` +
  COLLECTIONS.map((c) => `- **[${c.title}](${c.slug}.md)** — ${c.desc} _(${collRows(c).length} providers)_`).join('\n') +
  `\n\n[← Back to the main list](../README.md)\n`;
writeFileSync(join(ROOT, 'collections/README.md'), hubMd);

// --- collections hub (live HTML) ---
const hubCards = COLLECTIONS.map((c) =>
  `<a class="coll-card" href="${c.slug}.html"><div class="coll-card-head"><strong>${htmlEsc(c.title)}</strong><span class="count">${collRows(c).length}</span></div><p>${htmlEsc(c.desc)}</p></a>`
).join('');
const hubMain =
  `<section class="page-hero"><div class="wrap">` +
  `<nav class="crumbs"><a href="../">Home</a> / Collections</nav>` +
  `<h1>Collections</h1><p class="lede">Curated, always-current slices of the dataset — filter the list by a single constraint you actually have. Every collection is generated from the data and updates automatically.</p>` +
  `</div></section>` +
  `<main id="main"><div class="wrap"><div class="coll-grid">${hubCards}</div></div></main>`;
writeFileSync(
  join(ROOT, 'site/collections/index.html'),
  htmlPage({ title: 'Collections · Free LLM API Hub', desc: 'Curated, always-current collections of free LLM APIs by constraint: no card, no phone, commercial use, OpenAI-compatible, permanently free, multimodal.', canonical: `${SITE}/collections/`, main: hubMain })
);

// ---------- per-provider detail pages + embeddable badges ----------
mkdirSync(join(ROOT, 'site/p'), { recursive: true });
mkdirSync(join(ROOT, 'site/badges'), { recursive: true });

// Per-provider change history, mined from the git log of data/providers.json.
// Deterministic given the history; graceful if git is unavailable (tarball build).
const HISTORY_FIELDS = {
  free_tier: 'free tier', rate_limits: 'rate limits', notes: 'the catch',
  free_type: 'free type', commercial_ok: 'commercial-use terms',
  card_required: 'card requirement', phone_required: 'phone requirement',
  openai_compatible: 'OpenAI compatibility',
};
const historyBySlug = {};
try {
  const log = execSync('git log --reverse --date=short --format=%H%x1f%ad -- data/providers.json', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 40 }).trim();
  const revs = log ? log.split('\n').map((l) => { const [hash, date] = l.split('\x1f'); return { hash, date }; }) : [];
  const prevSnap = {};
  for (const { hash, date } of revs) {
    let parsed;
    try { parsed = JSON.parse(execSync(`git show ${hash}:data/providers.json`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 40 })); }
    catch { continue; }
    for (const pp of parsed.providers || []) {
      const prior = prevSnap[pp.slug];
      if (!prior) {
        (historyBySlug[pp.slug] ||= []).push({ date, kind: 'added', text: 'Added to the hub' });
      } else {
        const changed = Object.keys(HISTORY_FIELDS).filter((k) => JSON.stringify(prior[k]) !== JSON.stringify(pp[k]));
        if (changed.length) (historyBySlug[pp.slug] ||= []).push({ date, kind: 'changed', fields: changed, text: `Updated ${changed.map((k) => HISTORY_FIELDS[k]).join(', ')}` });
      }
      prevSnap[pp.slug] = pp;
    }
  }
} catch (_) { /* no git — provider pages simply omit the history section */ }
const historyHtml = (slug) => {
  const all = historyBySlug[slug] || [];
  if (!all.length) return '';
  const items = all.slice().reverse().map((e) => `<li class="upd"><span class="upd-date">${e.date}</span> <span>${htmlEsc(e.text)}</span></li>`).join('');
  return `<h2>Change history</h2>` +
    `<p class="muted">How this free tier has changed since we started tracking it (${all[0].date}) — generated from the git history of <a href="${REPO}/commits/main/data/providers.json">providers.json</a>.</p>` +
    `<ul class="upd-list">${items}</ul>`;
};

const provFlagsHtml = (p) => {
  const parts = [];
  const add = (cond, ic, txt) => { if (cond) parts.push(`<span class="flag-badge">${IC(ic)}${txt}</span>`); };
  add(p.card_required === false, 'ic-nocard', 'no card'); add(p.card_required === true, 'ic-card', 'card required');
  add(p.phone_required === false, 'ic-nophone', 'no phone'); add(p.phone_required === true, 'ic-phone', 'phone required');
  add(p.commercial_ok === true, 'ic-building', 'commercial OK'); add(p.commercial_ok === false, 'ic-flask', 'eval only');
  add(p.openai_compatible === true, 'ic-code', 'OpenAI-compatible');
  return parts.join('');
};

for (const p of providers) {
  const inColls = COLLECTIONS.filter((c) => collRows(c).some((x) => x.slug === p.slug));
  const inGuides = GUIDES.filter((g) => g.filter(p));
  // Concrete free model for snippets: prefer a real sampled ID, else a sensible default.
  const DEFAULT_MODEL = { groq: 'llama-3.1-8b-instant' };
  const model = (p.models_free && p.models_free[0]) || DEFAULT_MODEL[p.slug] || '<a-free-model>';
  const mods = p.modalities || [];
  const embeddingsFirst = mods.includes('embeddings') && !mods.includes('text');

  // Quickstart — modality-aware, using the provider's real base URL and a real free model.
  let quick = '';
  if (p.openai_base_url) {
    const base = htmlEsc(p.openai_base_url);
    const m = htmlEsc(model);
    quick = embeddingsFirst
      ? `<h2>Quickstart — embeddings</h2><pre><code>from openai import OpenAI

client = OpenAI(base_url="${base}", api_key="&lt;YOUR_FREE_API_KEY&gt;")
resp = client.embeddings.create(model="${m}", input="Hello world")
print(len(resp.data[0].embedding))</code></pre>`
      : `<h2>Quickstart — chat completions</h2><pre><code>from openai import OpenAI

client = OpenAI(base_url="${base}", api_key="&lt;YOUR_FREE_API_KEY&gt;")
resp = client.chat.completions.create(
    model="${m}",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)</code></pre><p class="muted">…or with curl:</p><pre><code>curl ${base}/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${m}","messages":[{"role":"user","content":"Hello!"}]}'</code></pre>`;
  }

  // Free models — a prominent block when we have a sample, with a way to pull the live list.
  const modelsBlock = (p.models_free && p.models_free.length)
    ? `<h2>Free models <span class="muted">· sample</span></h2>` +
      `<div class="model-chips">${p.models_free.map((mm) => `<code>${htmlEsc(mm)}</code>`).join('')}</div>` +
      `<p class="muted">A sample of models reachable on the free tier — the live catalog changes.` +
      (p.openai_base_url ? ` Pull the current set with <code>GET ${htmlEsc(p.openai_base_url)}/models</code>.` : '') +
      `</p>`
    : '';

  const summary = `<div class="prov-summary"><h3>What's free</h3><p>${htmlEsc(p.free_tier)}</p></div>`;
  const bigCards = [
    ['Rate limits', htmlEsc(p.rate_limits)],
    ['The catch', htmlEsc(p.notes)],
  ].filter(([, v]) => v).map(([k, v]) => `<div class="prov-card"><h3>${k}</h3><p>${v}</p></div>`).join('');
  const metaRows = [
    ['Type', typeLabel(p) + (p.category === 'ongoing' ? ' free tier' : ' credit')],
    ['Free type', htmlEsc(p.free_type)],
    ['Expires', htmlEsc(p.expires) || 'no expiry'],
    ['Modalities', mods.join(', ') || '—'],
    ['OpenAI base URL', p.openai_base_url ? `<code>${htmlEsc(p.openai_base_url)}</code>` : '—'],
    ...(p.added ? [['Added to the hub', htmlEsc(p.added)]] : []),
  ].map(([k, v]) => `<div class="meta-row"><span class="meta-k">${k}</span><span class="meta-v">${v}</span></div>`).join('');
  // Freshness relative to the current day (provider pages are regenerated on deploy, not diff-gated).
  const daysAgo = p.verified && p.last_verified ? ageInDays(p.last_verified, today) : null;
  const verifiedLine = p.verified
    ? `<span class="v ok">${IC('ic-check')} verified ${htmlEsc(p.last_verified)}${daysAgo != null ? ` · ${daysAgo}d ago` : ''}</span>` +
      (daysAgo != null && daysAgo > FRESH_DAYS ? ` <span class="v warn">${IC('ic-warn')} re-verification due</span>` : '')
    : `<span class="v warn">${IC('ic-warn')} unverified</span>`;
  // Live-test badge: an actual successful API call, separate from the docs-based `verified`.
  const probedLine = p.probe_status === 'live'
    ? ` <span class="v live" title="A real free-tier API call succeeded on this date">${IC('ic-check')} live-tested ${htmlEsc(p.last_probed || '')}</span>`
    : (p.probe_status === 'auth-ok'
        ? ` <span class="v ok" title="Credentials accessed /models; no inference was attempted">${IC('ic-check')} credentials checked ${htmlEsc(p.last_probed || '')}</span>`
        : (p.probe_status === 'tier-ended'
        ? ` <span class="v warn" title="The key authenticated but the free tier appears gone">${IC('ic-warn')} free tier unconfirmed live</span>`
        : ''));
  const docsBtn = p.docs_url ? `<a class="btn primary" href="${htmlEsc(p.docs_url)}" target="_blank" rel="noopener">Official docs ↗</a>` : '';
  // "Visit website": the provider's main site, derived from the docs URL by stripping
  // common docs/console/api subdomains so it points at the marketing homepage.
  let websiteBtn = '';
  try {
    const u = new URL(p.docs_url);
    const host = u.hostname.replace(/^(docs|console|platform|developer|developers|api|dashboard|cloud|build|support|help|inference-docs)\./, '');
    websiteBtn = `<a class="btn website" href="${u.protocol}//${host}" target="_blank" rel="noopener">Visit website ↗</a>`;
  } catch (_) { /* no/invalid docs URL — skip the website button */ }
  const crossChips = [
    ...inColls.map((c) => `<a href="../collections/${c.slug}.html">${htmlEsc(c.title)}</a>`),
    ...inGuides.map((g) => `<a href="../guides/${g.slug}.html">${htmlEsc(g.card)}</a>`),
  ].join('');
  const main =
    `<section class="page-hero prov-hero"><div class="wrap">` +
    `<nav class="crumbs"><a href="../">Home</a> / <a href="../#explorer">Providers</a> / ${htmlEsc(p.name)}</nav>` +
    `<h1>${htmlEsc(p.name)}</h1>` +
    `<div class="prov-badges"><span class="type">${typeLabel(p)}</span> ${verifiedLine}${probedLine} ${provFlagsHtml(p)}</div>` +
    (p.best_for ? `<p class="lede">${htmlEsc(p.best_for)}</p>` : '') +
    (docsBtn || websiteBtn ? `<div class="prov-actions">${docsBtn}${websiteBtn}</div>` : '') +
    `</div></section>` +
    `<main id="main"><div class="wrap prose">` +
    summary +
    (bigCards ? `<div class="prov-grid">${bigCards}</div>` : '') +
    `<div class="prov-meta">${metaRows}</div>` +
    modelsBlock +
    quick +
    (crossChips ? `<h2>Appears in</h2><div class="colls">${crossChips}</div>` : '') +
    historyHtml(p.slug) +
    `<p class="prov-back"><a href="../#explorer">← All providers</a></p>` +
    `</div></main>`;
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage', name: `${p.name} — free LLM API`, description: p.free_tier, url: `${SITE}/p/${p.slug}.html`,
        isPartOf: { '@type': 'Dataset', name: 'Free LLM API Hub', url: `${SITE}/` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Free LLM API Hub', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Providers', item: `${SITE}/#explorer` },
          { '@type': 'ListItem', position: 3, name: p.name, item: `${SITE}/p/${p.slug}.html` },
        ],
      },
    ],
  });
  writeFileSync(
    join(ROOT, `site/p/${p.slug}.html`),
    htmlPage({ title: `${p.name} — free tier & limits · Free LLM API Hub`, desc: `${p.name}: ${p.free_tier}`.slice(0, 180), canonical: `${SITE}/p/${p.slug}.html`, main, jsonld, ogImage: `${SITE}/og/p/${p.slug}.png` })
  );

  // Embeddable per-provider badge. Same rule as the repo badge: the colour tracks
  // the age of the verification, so an entry someone embedded and forgot goes amber
  // past 60 days and red past the SLA instead of staying brightgreen forever.
  writeFileSync(
    join(ROOT, `site/badges/${p.slug}.json`),
    JSON.stringify({
      schemaVersion: 1,
      label: 'free-llm-api-hub',
      message: p.verified ? `verified ${p.last_verified}` : 'unverified',
      color: p.verified ? freshnessColor(daysAgo) : 'yellow',
    }) + '\n'
  );
}

// ---------- legal pages (minimal, noindex) ----------
mkdirSync(join(ROOT, 'site/legal'), { recursive: true });
const ORG = 'Tweakeo, Inc.';
const ADDRESS = 'Tweakeo, Inc., 2093 Philadelphia Pike, Suite #4108, Claymont, DE 19703';
const legalPage = (slug, title, bodyHtml) => {
  const main =
    `<section class="page-hero"><div class="wrap">` +
    `<nav class="crumbs"><a href="../">Home</a> / ${htmlEsc(title)}</nav>` +
    `<h1>${htmlEsc(title)}</h1>` +
    `</div></section>` +
    `<main id="main"><div class="wrap prose legal">${bodyHtml}` +
    `<p class="legal-org">${ADDRESS} · <a href="mailto:admin@tweakeo.com">admin@tweakeo.com</a></p>` +
    `</div></main>`;
  writeFileSync(
    join(ROOT, `site/legal/${slug}.html`),
    htmlPage({ title: `${title} · Free LLM API Hub`, desc: `${title} for Free LLM API Hub, operated by ${ORG}.`, canonical: `${SITE}/legal/${slug}.html`, main, noindex: true })
  );
};

legalPage('privacy', 'Privacy', `
<p>This site is a static, open-source reference operated by ${ORG}. It has no user accounts, no ads, and no third-party analytics or tracking.</p>
<h2>What we store</h2>
<ul>
<li><strong>Nothing on a server.</strong> The site is served as static files by GitHub Pages; there is no backend and no cookies are set.</li>
<li><strong>Your theme choice</strong> (light/dark) is saved only in your browser's local storage and never leaves your device.</li>
<li><strong>The GitHub star count</strong> is fetched directly from GitHub's public API when a page loads; that request is governed by GitHub's own privacy policy.</li>
</ul>
<h2>Hosting</h2>
<p>Pages, fonts and assets are delivered by GitHub Pages (GitHub, Inc.), which may process standard request metadata (such as your IP address) to serve content, per GitHub's privacy statement.</p>
<h2>Contact</h2>
<p>Questions about privacy? Email <a href="mailto:admin@tweakeo.com">admin@tweakeo.com</a>.</p>
`);

legalPage('terms', 'Terms of Use', `
<p>The Free LLM API Hub dataset and website are provided by ${ORG} for informational purposes under the <a href="${REPO}/blob/main/LICENSE">MIT License</a>.</p>
<h2>No warranty</h2>
<p>The information is provided "as is", without warranty of any kind. Free-tier terms, limits and pricing change frequently and may be inaccurate or out of date. Always confirm details against each provider's own official documentation before relying on them.</p>
<h2>No affiliation</h2>
<p>This is an independent, community-maintained project. It is not affiliated with, endorsed by, or sponsored by any provider listed. All product names and trademarks are the property of their respective owners.</p>
<h2>Liability</h2>
<p>To the maximum extent permitted by law, ${ORG} and the project's contributors are not liable for any loss or damage arising from use of this site or dataset.</p>
<h2>Contact</h2>
<p>Email <a href="mailto:admin@tweakeo.com">admin@tweakeo.com</a>.</p>
`);

// ---------- updates page + RSS feed (from git history; graceful if git is absent) ----------
let commits = [];
try {
  const raw = execSync('git log -n 40 --date=short --pretty=format:%h%x1f%ad%x1f%s -- data README.md docs collections scripts site', { cwd: ROOT, encoding: 'utf8' });
  commits = raw.split('\n')
    .map((l) => { const [hash, date, subject] = l.split('\x1f'); return { hash, date, subject }; })
    .filter((c) => c.subject && !/\[skip ci\]|refresh freshness badge/i.test(c.subject))
    .slice(0, 25);
} catch (_) { /* no git available — skip the feed */ }

if (commits.length) {
  const updItems = commits
    .map((c) => `<li class="upd"><span class="upd-date">${c.date}</span> <a href="${REPO}/commit/${c.hash}" target="_blank" rel="noopener">${htmlEsc(c.subject)}</a></li>`)
    .join('\n');
  const updMain =
    `<section class="page-hero"><div class="wrap"><nav class="crumbs"><a href="./">Home</a> / Updates</nav>` +
    `<h1>Updates</h1><p class="lede">Every recent change to the dataset and site, newest first. Subscribe via <a href="feed.xml">RSS</a>.</p></div></section>` +
    `<main id="main"><div class="wrap"><ul class="upd-list">${updItems}</ul></div></main>`;
  writeFileSync(join(ROOT, 'site/updates.html'), htmlPage({ title: 'Updates · Free LLM API Hub', desc: 'Recent changes to the Free LLM API Hub dataset and site.', canonical: `${SITE}/updates.html`, main: updMain, prefix: '' }));

  const rssItems = commits
    .map((c) => `    <item><title>${htmlEsc(c.subject)}</title><link>${REPO}/commit/${c.hash}</link><guid isPermaLink="true">${REPO}/commit/${c.hash}</guid><pubDate>${new Date(c.date + 'T00:00:00Z').toUTCString()}</pubDate></item>`)
    .join('\n');
  const rss =
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n` +
    `    <title>Free LLM API Hub — updates</title>\n    <link>${SITE}/</link>\n    <description>Changes to the continuously-verified free LLM &amp; AI-model API dataset.</description>\n` +
    `${rssItems}\n</channel></rss>\n`;
  writeFileSync(join(ROOT, 'site/feed.xml'), rss);
}

// ---------- credit programs: site pages + doc, from data/programs.json ----------
const programs = JSON.parse(readFileSync(join(ROOT, 'data/programs.json'), 'utf8'));
mkdirSync(join(ROOT, 'site/programs'), { recursive: true });
const FUNDS_HTML = {
  yes: '<span class="funds yes">✅ LLM API</span>',
  partial: '<span class="funds partial">◐ via cloud</span>',
  no: '<span class="funds no">✖ perks only</span>',
};
const FUNDS_MD = { yes: '✅ LLM API', partial: '◐ via cloud', no: '✖ perks only' };
const LEGEND = 'Funds LLM API? — ✅ first-party LLM-API credits · ◐ cloud/compute usable for managed LLM APIs (Bedrock, Vertex AI, Azure OpenAI) · ✖ training / perks only.';
const startupsRowHtml = (r) => `<tr><td class="name"><a href="${htmlEsc(r.url)}" target="_blank" rel="noopener">${htmlEsc(r.name)}</a></td><td>${htmlEsc(r.what)}</td><td>${FUNDS_HTML[r.funds]}</td><td class="notes">${htmlEsc(r.who)}</td></tr>`;
const researchRowHtml = (r) => `<tr><td class="name"><a href="${htmlEsc(r.url)}" target="_blank" rel="noopener">${htmlEsc(r.name)}</a></td><td><span class="type">${htmlEsc(r.audience)}</span></td><td>${htmlEsc(r.what)}</td><td>${FUNDS_HTML[r.funds]}</td><td class="notes">${htmlEsc(r.who)}</td></tr>`;

const programPage = (slug, h1, lede, tableHead, rowsHtml, extra = '') =>
  htmlPage({
    title: `${h1} · Free LLM API Hub`, desc: stripTags(lede), canonical: `${SITE}/programs/${slug}.html`,
    main:
      `<section class="page-hero"><div class="wrap"><nav class="crumbs"><a href="../">Home</a> / ${htmlEsc(h1)}</nav>` +
      `<h1>${htmlEsc(h1)}</h1><p class="lede">${lede}</p></div></section>` +
      `<main id="main"><div class="wrap prose"><p class="count"><strong>${LEGEND}</strong></p>` +
      `<table><thead>${tableHead}</thead><tbody>\n${rowsHtml}\n</tbody></table>` +
      `<p style="margin-top:24px">Looking for a key to use right now with no application? See the <a href="../#explorer">verified self-serve list</a>.</p>${extra}</div></main>`,
  });

writeFileSync(join(ROOT, 'site/programs/startups.html'), programPage(
  'startups', 'Free credits for startups',
  'Apply-to-get credit programs that can fund LLM / AI-model API usage — volatile, so confirm the current terms before you rely on one. Different from the <a href="../#explorer">self-serve dataset</a>: these need eligibility and an application.',
  '<tr><th>Program</th><th>What you get</th><th>Funds LLM API?</th><th>Who qualifies</th></tr>',
  programs.startups.map(startupsRowHtml).join('\n'),
  `<p style="margin-top:16px">A student or researcher instead? See <a href="research.html">free credits for students &amp; researchers</a>.</p>`));

writeFileSync(join(ROOT, 'site/programs/research.html'), programPage(
  'research', 'Free credits for students & researchers',
  'Student and academic/research programs that give credits or access usable for LLM / AI-model APIs. Different from the <a href="../#explorer">self-serve dataset</a>: these need eligibility and an application.',
  '<tr><th>Program</th><th>Audience</th><th>What you get</th><th>Funds LLM API?</th><th>Who qualifies</th></tr>',
  programs.research.map(researchRowHtml).join('\n'),
  `<p style="margin-top:16px">Building a startup instead? See <a href="startups.html">free credits for startups</a>.</p>`));

// regenerate the companion doc tables from the same source (data-first)
const startupsMd = '| Program | What you get | Funds LLM API? | Who qualifies |\n|---|---|---|---|\n' +
  programs.startups.map((r) => `| **[${esc(r.name)}](${r.url})** | ${esc(r.what)} | ${FUNDS_MD[r.funds]} | ${esc(r.who)} |`).join('\n');
const researchMd = '| Program | Audience | What you get | Funds LLM API? | Who qualifies |\n|---|---|---|---|---|\n' +
  programs.research.map((r) => `| **[${esc(r.name)}](${r.url})** | ${esc(r.audience)} | ${esc(r.what)} | ${FUNDS_MD[r.funds]} | ${esc(r.who)} |`).join('\n');
let creditDoc = readFileSync(join(ROOT, 'docs/credit-programs.md'), 'utf8');
creditDoc = inject(creditDoc, 'startups', startupsMd);
creditDoc = inject(creditDoc, 'research', researchMd);
writeFileSync(join(ROOT, 'docs/credit-programs.md'), creditDoc);

// ---------- free model index: model -> provider, searchable ----------
mkdirSync(join(ROOT, 'site/models'), { recursive: true });
const modelIndex = [];
for (const p of providers) for (const m of (p.models_free || [])) modelIndex.push({ m, p });
modelIndex.sort((a, b) => a.m.toLowerCase().localeCompare(b.m.toLowerCase()) || a.p.name.localeCompare(b.p.name));
const modelProviderCount = providers.filter((p) => p.models_free && p.models_free.length).length;
const modelRowHtml = ({ m, p }) =>
  `<tr data-s="${htmlEsc((m + ' ' + p.name + ' ' + (p.modalities || []).join(' ')).toLowerCase())}">` +
  `<td class="name"><code>${htmlEsc(m)}</code></td>` +
  `<td><a href="../p/${p.slug}.html">${htmlEsc(p.name)}</a></td>` +
  `<td>${htmlEsc(p.free_type)}</td>` +
  `<td class="notes">${(p.modalities || []).join(', ') || '—'}</td></tr>`;
const modelsMain =
  `<section class="page-hero"><div class="wrap"><nav class="crumbs"><a href="../">Home</a> / Free model index</nav>` +
  `<h1>Free model index</h1><p class="lede">Every model our verified providers expose on a free tier — <strong>${modelIndex.length}</strong> entries across <strong>${modelProviderCount}</strong> providers, pulled from each provider's own <code>/models</code> endpoint where possible. The same model can appear under more than one provider.</p>` +
  `<input id="mq" class="model-search" type="search" placeholder="Filter by model or provider — e.g. llama, deepseek, whisper, gpt-oss" aria-label="Filter models">` +
  `<p class="count"><span id="mshown">${modelIndex.length}</span> shown</p></div></section>` +
  `<main id="main"><div class="wrap"><table class="model-table"><thead><tr><th>Model</th><th>Provider</th><th>Free type</th><th>Modalities</th></tr></thead><tbody>\n` +
  modelIndex.map(modelRowHtml).join('\n') +
  `\n</tbody></table><p class="muted" style="margin-top:18px">Model lists are a live sample and change often — always confirm against the provider. A provider missing here usually needs an API key to list its models; <a href="${REPO}/blob/main/docs/update-playbook.md">see how the list is refreshed</a>.</p></div></main>`;
writeFileSync(join(ROOT, 'site/models/index.html'), htmlPage({
  title: 'Free model index — which free API serves which model · Free LLM API Hub',
  desc: `Searchable index of ${modelIndex.length} models available on free LLM & AI-model API tiers, and which provider serves each.`,
  canonical: `${SITE}/models/`,
  main: modelsMain,
  ogImage: `${SITE}/og/models.png`,
}));

// ---------- SEO guides: intent-matched landing pages, generated from the data ----------
mkdirSync(join(ROOT, 'site/guides'), { recursive: true });
const guideRow = (p) =>
  `<tr><td class="name"><a href="../p/${p.slug}.html">${htmlEsc(p.name)}</a></td>` +
  `<td>${htmlEsc(p.free_tier)}</td>` +
  `<td class="notes">${htmlEsc(p.rate_limits)}</td>` +
  `<td>${provFlagsHtml(p)}</td></tr>`;
for (const g of GUIDES) {
  const list = providers.filter(g.filter);
  const top = (g.pick && list.find((x) => x.slug === g.pick)) ||
    [...list].sort((a, b) => recScore(b) - recScore(a) || (a.name < b.name ? -1 : 1))[0];
  const related = GUIDES.filter((x) => x.slug !== g.slug)
    .map((x) => `<a href="${x.slug}.html">${htmlEsc(x.card)}</a>`).join('');
  const faqHtml = (g.faq && g.faq.length)
    ? `<h2>FAQ</h2>` + g.faq.map((f) => `<div class="faq-item"><h3>${htmlEsc(f.q)}</h3><p>${f.a}</p></div>`).join('')
    : '';
  const main =
    `<section class="page-hero"><div class="wrap"><nav class="crumbs"><a href="../">Home</a> / <a href="./">Guides</a> / ${htmlEsc(g.h1)}</nav>` +
    `<h1>${htmlEsc(g.h1)}</h1><p class="lede">${htmlEsc(g.lede)}</p></div></section>` +
    `<main id="main"><div class="wrap prose">` +
    g.intro +
    (top ? `<div class="prov-summary"><h3>Top pick — ${htmlEsc(top.name)}</h3><p>${htmlEsc(top.best_for || top.free_tier)} <a href="../p/${top.slug}.html">Details →</a></p></div>` : '') +
    `<p class="count"><strong>${list.length}</strong> verified providers</p>` +
    `<table class="model-table"><thead><tr><th>Provider</th><th>Free tier</th><th>Rate limits</th><th>Gotchas</th></tr></thead><tbody>\n` +
    list.map(guideRow).join('\n') +
    `\n</tbody></table>` +
    `<div class="prov-actions" style="margin-top:22px"><a class="btn primary" href="../${g.query}">Open in the explorer →</a></div>` +
    faqHtml +
    `<h2>More guides</h2><nav class="colls">${related}</nav>` +
    `<p class="prov-back"><a href="./">← All guides</a></p>` +
    `</div></main>`;
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article', headline: g.h1, description: g.desc,
        url: `${SITE}/guides/${g.slug}.html`, isPartOf: { '@type': 'WebSite', name: 'Free LLM API Hub', url: `${SITE}/` },
      },
      ...(g.faq && g.faq.length ? [{
        '@type': 'FAQPage',
        mainEntity: g.faq.map((f) => ({
          '@type': 'Question', name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: stripTags(f.a) },
        })),
      }] : []),
    ],
  });
  writeFileSync(join(ROOT, `site/guides/${g.slug}.html`), htmlPage({
    title: g.title, desc: g.desc, canonical: `${SITE}/guides/${g.slug}.html`, main, jsonld,
    ogImage: `${SITE}/og/guides/${g.slug}.png`,
  }));
}
const guidesHubMain =
  `<section class="page-hero"><div class="wrap"><nav class="crumbs"><a href="../">Home</a> / Guides</nav>` +
  `<h1>Guides</h1><p class="lede">Short, data-backed answers to the most common "is there a free API for…" questions. Every list is generated from the verified dataset, so it stays current.</p></div></section>` +
  `<main id="main"><div class="wrap"><div class="coll-grid">` +
  GUIDES.map((g) => `<a class="coll-card" href="${g.slug}.html"><div class="coll-card-head"><strong>${htmlEsc(g.card)}</strong><span class="count">${providers.filter(g.filter).length}</span></div><p>${htmlEsc(g.blurb)}</p></a>`).join('') +
  `</div></div></main>`;
writeFileSync(join(ROOT, 'site/guides/index.html'), htmlPage({
  title: 'Guides — free LLM & AI API how-tos · Free LLM API Hub',
  desc: 'Data-backed guides to free LLM and AI-model APIs: no credit card, OpenAI-compatible, no signup, embeddings, speech, image generation, OCR / document AI.',
  canonical: `${SITE}/guides/`, main: guidesHubMain,
}));

// ---------- machine-readable: static JSON API (/api/v1) + llms.txt ----------
// Deterministic slices of the dataset at stable, versioned URLs — a "public API"
// that works on static hosting (no server, no query params, CORS-open). Plus
// llms.txt / llms-full.txt (llmstxt.org) so AI agents can consume the hub directly.
mkdirSync(join(ROOT, 'site/api/v1/modality'), { recursive: true });
const apiBase = { dataset: 'free-llm-api-hub', version: data.version, generated: data.generated, license: 'MIT', homepage: `${SITE}/`, docs: `${SITE}/api/` };
const writeApi = (rel, obj) => writeFileSync(join(ROOT, `site/api/v1/${rel}`), JSON.stringify(obj, null, 2) + '\n');
writeApi('providers.json', { ...apiBase, count: publicProviders.length, providers: publicProviders });
writeApi('programs.json', { ...apiBase, startups: programs.startups, research: programs.research });
writeApi('history.json', { ...apiBase, description: 'Per-provider change history mined from the git log of providers.json.', history: historyBySlug });
const API_SLICES = {
  ongoing: (p) => p.category === 'ongoing',
  trial: (p) => p.category === 'trial',
  perpetual: (p) => p.free_type === 'perpetual',
  'no-card': (p) => p.card_required === false,
  'no-phone': (p) => p.phone_required === false,
  commercial: (p) => p.commercial_ok === true,
  'openai-compatible': (p) => p.openai_compatible === true,
};
for (const [name, fn] of Object.entries(API_SLICES)) {
  const list = publicProviders.filter(fn);
  writeApi(`${name}.json`, { ...apiBase, slice: name, count: list.length, providers: list });
}
const API_MODS = ['text', 'vision', 'image', 'audio', 'embeddings', 'rerank', 'ocr'];
for (const m of API_MODS) {
  const list = publicProviders.filter((p) => (p.modalities || []).includes(m));
  writeApi(`modality/${m}.json`, { ...apiBase, modality: m, count: list.length, providers: list });
}
const apiEndpoints = {
  providers: 'v1/providers.json',
  programs: 'v1/programs.json',
  history: 'v1/history.json',
  slices: Object.fromEntries(Object.keys(API_SLICES).map((s) => [s, `v1/${s}.json`])),
  modality: Object.fromEntries(API_MODS.map((m) => [m, `v1/modality/${m}.json`])),
};
writeApi('index.json', { ...apiBase, description: 'Static, versioned JSON over the free-llm-api-hub dataset. Paths are relative to /api/v1/. Regenerated on every dataset change; no query params, no auth, no rate limits.', counts: { providers: publicProviders.length, ongoing: ongoing.length, trial: trial.length, programs: programs.startups.length + programs.research.length }, endpoints: apiEndpoints });

// human-facing API docs page
const apiRow = (label, path, count) => `<tr><td class="name"><a href="v1/${path}"><code>/api/v1/${path}</code></a></td><td>${htmlEsc(label)}</td><td>${count != null ? count : ''}</td></tr>`;
const apiDocMain =
  `<section class="page-hero"><div class="wrap"><nav class="crumbs"><a href="../">Home</a> / API</nav>` +
  `<h1>Static JSON API</h1><p class="lede">The whole dataset as versioned, machine-readable JSON at stable URLs — no server, no query params, no auth, no rate limits. CORS-open, so you can <code>fetch()</code> it straight from the browser. Regenerated on every dataset change (currently v${data.version}).</p></div></section>` +
  `<main id="main"><div class="wrap prose">` +
  `<h2>Everything</h2><table class="model-table"><thead><tr><th>Endpoint</th><th>Contents</th><th>Count</th></tr></thead><tbody>` +
  apiRow('Full provider dataset (all fields)', 'providers.json', publicProviders.length) +
  apiRow('Apply-to-get credit programs', 'programs.json', programs.startups.length + programs.research.length) +
  apiRow('Endpoint manifest', 'index.json', null) +
  `</tbody></table>` +
  `<h2>Slices (by constraint)</h2><table class="model-table"><thead><tr><th>Endpoint</th><th>Contents</th><th>Count</th></tr></thead><tbody>` +
  Object.entries(API_SLICES).map(([n, fn]) => apiRow(`Providers where ${n.replace(/-/g, ' ')}`, `${n}.json`, publicProviders.filter(fn).length)).join('') +
  `</tbody></table>` +
  `<h2>Slices (by modality)</h2><table class="model-table"><thead><tr><th>Endpoint</th><th>Contents</th><th>Count</th></tr></thead><tbody>` +
  API_MODS.map((m) => apiRow(`Providers with a free ${m} modality`, `modality/${m}.json`, publicProviders.filter((p) => (p.modalities || []).includes(m)).length)).join('') +
  `</tbody></table>` +
  `<h2>Example</h2><pre><code>curl -s ${SITE}/api/v1/no-card.json | jq '.providers[].name'</code></pre>` +
  `<p class="muted">Every object carries the dataset <code>version</code> and <code>generated</code> date. Prefer a stable snapshot? Pin a Git tag of <a href="${REPO}">the repo</a>. For AI agents, see <a href="../llms.txt">llms.txt</a>.</p>` +
  `</div></main>`;
mkdirSync(join(ROOT, 'site/api'), { recursive: true });
writeFileSync(join(ROOT, 'site/api/index.html'), htmlPage({
  title: 'Static JSON API · Free LLM API Hub',
  desc: 'The free-llm-api-hub dataset as versioned, machine-readable JSON at stable URLs — full dataset plus pre-filtered slices by category, constraint and modality. No auth, no rate limits.',
  canonical: `${SITE}/api/`, main: apiDocMain, prefix: '../',
}));

// llms.txt (concise index) + llms-full.txt (every provider expanded) — llmstxt.org
const programCount = programs.startups.length + programs.research.length;
const llmsSummary = `A continuously-verified, machine-readable dataset of free-tier and trial-credit LLM (and adjacent AI-model) APIs for developers. Every entry is dated and sourced to the provider's own docs.`;
const llmsTxt =
  `# Free LLM API Hub\n\n> ${llmsSummary}\n\n` +
  `${total} providers (${ongoing.length} ongoing free tiers, ${trial.length} trial credits) and ${programCount} apply-to-get credit programs. Schema v${data.version}. Terms change often — always confirm against each provider's own docs, linked from every entry. This whole site is static and machine-readable.\n\n` +
  `## Dataset\n` +
  `- [Full dataset, JSON](${SITE}/api/v1/providers.json): every provider, all fields\n` +
  `- [CSV export](${SITE}/providers.csv)\n` +
  `- [JSON Schema](${REPO}/blob/main/data/schema.json)\n` +
  `- [Static JSON API](${SITE}/api/): versioned endpoints + pre-filtered slices (category, modality, no-card, commercial, OpenAI-compatible, …)\n` +
  `- [Full provider list expanded, markdown](${SITE}/llms-full.txt)\n\n` +
  `## Guides\n` +
  GUIDES.map((g) => `- [${g.h1}](${SITE}/guides/${g.slug}.html): ${g.blurb}`).join('\n') + `\n\n` +
  `## Collections\n` +
  COLLECTIONS.map((c) => `- [${c.title}](${SITE}/collections/${c.slug}.html)`).join('\n') + `\n\n` +
  `## Credit programs\n` +
  `- [Startup credits](${SITE}/programs/startups.html)\n- [Student & research credits](${SITE}/programs/research.html)\n`;
writeFileSync(join(ROOT, 'site/llms.txt'), llmsTxt);

const yn = (v, yes, no) => v === true ? yes : v === false ? no : 'unknown';
const provBlock = (p) => {
  const gates = [
    `card required: ${yn(p.card_required, 'yes', 'no')}`,
    `phone required: ${yn(p.phone_required, 'yes', 'no')}`,
    `commercial use: ${yn(p.commercial_ok, 'allowed', 'not allowed')}`,
    `OpenAI-compatible: ${yn(p.openai_compatible, 'yes', 'no')}${p.openai_base_url ? ` (base ${p.openai_base_url})` : ''}`,
  ].join('; ');
  return `### ${p.name} — ${p.category === 'ongoing' ? 'ongoing free tier' : 'trial credit'}\n` +
    `- Free: ${p.free_tier}\n` +
    `- Rate limits: ${p.rate_limits || 'not specified'}\n` +
    `- The catch: ${p.notes || '—'}\n` +
    `- Modalities: ${(p.modalities || ['text']).join(', ')}\n` +
    `- Gates: ${gates}\n` +
    `- Docs: ${p.docs_url}\n` +
    `- Page: ${SITE}/p/${p.slug}.html\n`;
};
const llmsFull =
  `# Free LLM API Hub — full provider list\n\n> ${llmsSummary}\n\n` +
  `${total} providers, schema v${data.version}, generated ${data.generated}. Confirm every figure against the linked docs.\n\n` +
  `## Providers\n\n` +
  providers.map(provBlock).join('\n') + `\n`;
writeFileSync(join(ROOT, 'site/llms-full.txt'), llmsFull);

// ---------- sitemap.xml (site SEO) ----------
const sitemapUrls = [
  `${SITE}/`,
  `${SITE}/models/`,
  `${SITE}/guides/`,
  `${SITE}/collections/`,
  `${SITE}/api/`,
  `${SITE}/programs/startups.html`,
  `${SITE}/programs/research.html`,
  ...GUIDES.map((g) => `${SITE}/guides/${g.slug}.html`),
  ...(commits.length ? [`${SITE}/updates.html`] : []),
  ...COLLECTIONS.map((c) => `${SITE}/collections/${c.slug}.html`),
  ...providers.map((p) => `${SITE}/p/${p.slug}.html`),
];
const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  sitemapUrls
    .map((u) => `  <url><loc>${u}</loc><lastmod>${data.generated}</lastmod></url>`)
    .join('\n') +
  `\n</urlset>\n`;
writeFileSync(join(ROOT, 'site/sitemap.xml'), sitemap);

console.log(
  `Built: ${total} providers (${ongoing.length} ongoing, ${trial.length} trial), ` +
  `${verifiedCount} verified, ${freshCount} fresh <${FRESH_DAYS}d, ` +
  `oldest ${oldestAge}d / median ${medianAge}d → badge ${color}. ` +
  `${COLLECTIONS.length} collections, ${providers.length} provider pages + badges + sitemap generated.`
);
