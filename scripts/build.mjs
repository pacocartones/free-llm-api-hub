#!/usr/bin/env node
// Regenerates every derived artifact from the single source of truth: data/providers.json.
//   - README provider tables (between AUTOGEN markers)
//   - badge-freshness.json (root, for the shields.io endpoint badge)
//   - data/providers.csv and data/providers.yaml (portable exports)
//   - site/providers.json (+ csv/yaml) so the interactive site ships the data
// Zero dependencies. Run with: node scripts/build.mjs   (or `npm run build`)

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FRESH_DAYS = 90;

const data = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const providers = data.providers;

// ---------- freshness ----------
const today = new Date();
const isFresh = (p) => {
  if (!p.verified || !p.last_verified) return false;
  const d = new Date(p.last_verified + 'T00:00:00Z');
  if (Number.isNaN(+d)) return false;
  return (today - d) / 86400000 <= FRESH_DAYS;
};
const total = providers.length;
const ongoing = providers.filter((p) => p.category === 'ongoing');
const trial = providers.filter((p) => p.category === 'trial');
const freshCount = providers.filter(isFresh).length;
const verifiedCount = providers.filter((p) => p.verified).length;

// ---------- markdown helpers ----------
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();

function flags(p) {
  const parts = [];
  if (p.card_required === false) parts.push('💳 no card');
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
const SITE = 'https://pacocartones.github.io/free-llm-api-hub';

const COLLECTIONS = [
  {
    slug: 'no-credit-card',
    title: 'Free LLM APIs with no credit card',
    h1: 'Free LLM APIs with no credit card required',
    desc: 'LLM APIs you can start calling without entering a payment method — filtered live from a continuously-verified dataset.',
    intro: 'Every provider below offers free API access with **no card required** to get started (`card_required: false`, confirmed against their own docs). Rows where the requirement is unknown are excluded rather than assumed.',
    filter: (p) => p.card_required === false,
  },
  {
    slug: 'no-phone',
    title: 'Free LLM APIs with no phone verification',
    h1: 'Free LLM APIs with no phone number required',
    desc: 'LLM APIs whose signup needs no SMS/phone verification — a live slice of a continuously-verified dataset.',
    intro: 'Providers you can sign up for **without phone verification** (`phone_required: false`). Groq, Mistral, SiliconFlow and NVIDIA are excluded here because they gate signup behind a phone number.',
    filter: (p) => p.phone_required === false,
  },
  {
    slug: 'commercial-use',
    title: 'Free LLM APIs for commercial use',
    h1: 'Free LLM APIs you can use commercially',
    desc: 'Free LLM API tiers that permit production/commercial use — not restricted to evaluation. Verified against each provider’s terms.',
    intro: 'Free tiers that **allow commercial/production use** (`commercial_ok: true`). Eval-only tiers (Cohere trial keys, NVIDIA NIM, GitHub Models) are deliberately excluded — read their rows in the main list for the restriction.',
    filter: (p) => p.commercial_ok === true,
  },
  {
    slug: 'openai-compatible',
    title: 'OpenAI-compatible free LLM APIs',
    h1: 'Free LLM APIs with an OpenAI-compatible endpoint',
    desc: 'Free LLM APIs that expose an OpenAI-compatible endpoint — point the OpenAI SDK at a new base_url and you are done.',
    intro: 'These providers expose an **OpenAI-compatible endpoint** (`openai_compatible: true`), so migrating is usually a one-line change: keep the OpenAI SDK, swap `base_url` and `api_key`. Grab each provider’s exact base URL from its linked docs.',
    filter: (p) => p.openai_compatible === true,
    quickstart: true,
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
</defs></svg>`;
const IC = (id) => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;

const siteHeader = (p) => `<header class="site-header"><div class="wrap header-inner">
<a class="brand" href="${p}" aria-label="Free LLM API Hub — home"><svg class="logo-mark"><use href="#logo"/></svg><span class="brand-name">Free LLM API <span class="grad">Hub</span></span></a>
<nav class="nav" aria-label="Primary"><a href="${p}#explorer">Explorer</a><a href="${p}models/">Models</a><a href="${p}collections/">Collections</a><a href="${p}programs/startups.html">Startup credits</a><a href="${p}programs/research.html">Student credits</a></nav>
<div class="header-actions">
<a class="icon-btn" href="${REPO}" target="_blank" rel="noopener" aria-label="Star on GitHub">${GH_ICON}<span class="star-count" data-stars>★</span></a>
<button class="icon-btn theme-toggle" id="themeToggle" aria-label="Toggle light and dark theme" title="Toggle theme"><svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><svg class="moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg></button>
</div></div></header>`;

const siteFooter = (p) => `<footer class="site-footer"><div class="wrap footer-top">
<div class="footer-brand"><a class="star-btn" href="${REPO}" target="_blank" rel="noopener" aria-label="Star free-llm-api-hub on GitHub"><span class="sb-label">${GH_ICON} Star on GitHub</span><span class="sb-count" data-stars>★</span></a><p>A continuously-verified, machine-readable dataset of free LLM &amp; AI-model APIs and trial credits for developers.</p></div>
<div class="footer-col"><h4>Explore</h4><a href="${p}#explorer">Interactive explorer</a><a href="${p}models/">Free model index</a><a href="${p}collections/">Collections</a><a href="${p}programs/startups.html">Startup credits</a><a href="${p}programs/research.html">Student &amp; research credits</a><a href="${p}updates.html">Updates</a><a href="${REPO}#notably-not-free">Notably NOT free</a></div>
<div class="footer-col"><h4>Data</h4><a href="${p}providers.json">providers.json</a><a href="${p}providers.csv">CSV export</a><a href="${p}providers.yaml">YAML export</a><a href="${REPO}/blob/main/data/schema.json">JSON Schema</a></div>
<div class="footer-col"><h4>Project</h4><a href="${REPO}/blob/main/docs/methodology.md">Methodology</a><a href="${REPO}/blob/main/CONTRIBUTING.md">Contributing</a><a href="${REPO}/blob/main/CHANGELOG.md">Changelog</a><a href="${REPO}">GitHub ★</a></div>
</div><div class="wrap footer-bottom"><a class="foot-logo" href="${p}" aria-label="Free LLM API Hub — home"><svg class="logo-mark"><use href="#logo"/></svg></a><p>Independent, community-maintained — not affiliated with any provider listed. Terms change without notice; always confirm against each provider's own docs. MIT licensed.</p><p class="foot-legal"><a href="${p}legal/privacy.html">Privacy</a> · <a href="${p}legal/terms.html">Terms</a> · Tweakeo, Inc.</p></div></footer>`;

// Full page wrapper for generated (collection) pages. `p` is the path prefix to the site root.
function htmlPage({ title, desc, canonical, main, jsonld, prefix = '../', noindex = false, ogImage = `${SITE}/og.png` }) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${htmlEsc(title)}</title>
<meta name="description" content="${htmlEsc(desc)}">${noindex ? '\n<meta name="robots" content="noindex">' : ''}
<script>(function(){try{var t=localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
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
${jsonld ? `<script type="application/ld+json">${jsonld}</script>` : ''}
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

// ---------- server-render the homepage explorer (SEO + no-JS + instant paint) ----------
const explorerFlagPairs = [
  ['card_required', false, 'ic-nocard', 'no card'], ['card_required', true, 'ic-card', 'card'],
  ['phone_required', false, 'ic-nophone', 'no phone'], ['phone_required', true, 'ic-phone', 'phone'],
  ['commercial_ok', true, 'ic-building', 'commercial'], ['commercial_ok', false, 'ic-flask', 'eval only'],
  ['openai_compatible', true, 'ic-code', 'OpenAI-compat'],
];
const explorerRowsHtml = (rows) => rows.map((p) => {
  const name = `<a href="p/${p.slug}.html">${htmlEsc(p.name)}</a>`;
  const best = p.best_for ? `<div class="best">${htmlEsc(p.best_for)}</div>` : '';
  const mods = (p.modalities || []).length ? `<div class="mods">${p.modalities.map((m) => `<span>${htmlEsc(m)}</span>`).join('')}</div>` : '';
  const baseurl = p.openai_base_url ? `<div class="baseurl" title="OpenAI-compatible base URL — click to copy" tabindex="0" role="button" data-copy="${htmlEsc(p.openai_base_url)}"><code>${htmlEsc(p.openai_base_url)}</code></div>` : '';
  const actions = [
    p.docs_url ? `<a class="docs-link" href="${htmlEsc(p.docs_url)}" target="_blank" rel="noopener">docs ↗</a>` : '',
    p.openai_base_url ? `<button type="button" class="copy-btn" data-snippet="${htmlEsc(p.openai_base_url)}">Copy OpenAI snippet</button>` : '',
  ].filter(Boolean).join('');
  const flags = explorerFlagPairs.filter(([k, v]) => p[k] === v).map(([, , ic, t]) => `<span class="flag">${IC(ic)}${t}</span>`).join('');
  const v = p.verified ? `<span class="badge b-ok">${IC('ic-check')} ${htmlEsc(p.last_verified)}</span>` : `<span class="badge b-warn">${IC('ic-warn')} unverified</span>`;
  return `<tr>` +
    `<td class="name" data-label="Provider">${name}${best}${baseurl}<div class="flags">${flags}</div>${mods}${actions ? `<div class="row-actions">${actions}</div>` : ''}</td>` +
    `<td data-label="Type"><span class="badge ${p.category === 'ongoing' ? 'b-ongoing' : 'b-trial'}">${p.category === 'ongoing' ? 'Ongoing' : 'Trial'}</span></td>` +
    `<td data-label="What's free">${htmlEsc(p.free_tier)}</td>` +
    `<td class="notes" data-label="The catch">${htmlEsc(p.notes || '')}</td>` +
    `<td data-label="Verified">${v}</td></tr>`;
}).join('\n');

// Same "recommended" scoring as the client, so SSR order matches the default view.
const recScore = (p) => {
  let s = 0;
  if (p.card_required === false) s += 3;
  if (p.phone_required === false) s += 2;
  if (p.commercial_ok === true) s += 2; else if (p.commercial_ok === false) s -= 2;
  if (p.openai_compatible === true) s += 1;
  if (p.category === 'ongoing') s += 1;
  if (p.free_type === 'perpetual') s += 1;
  return s;
};
const homeRows = explorerRowsHtml([...providers].sort((a, b) => recScore(b) - recScore(a) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)));
const inlineData = `<script type="application/json" id="providers-data">${JSON.stringify({ providers }).replace(/</g, '\\u003c')}</script>`;
let indexHtml = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
indexHtml = inject(indexHtml, 'rows', homeRows);
indexHtml = inject(indexHtml, 'data', inlineData);
writeFileSync(join(ROOT, 'site/index.html'), indexHtml);

// ---------- badge ----------
const ratio = total ? freshCount / total : 0;
const color = ratio >= 0.7 ? 'brightgreen' : ratio >= 0.4 ? 'yellow' : 'red';
writeFileSync(
  join(ROOT, 'badge-freshness.json'),
  JSON.stringify(
    { schemaVersion: 1, label: 'freshness', message: `${freshCount}/${total} verified <${FRESH_DAYS}d`, color },
    null,
    2
  ) + '\n'
);

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
copyFileSync(join(ROOT, 'data/providers.json'), join(ROOT, 'site/providers.json'));
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
  ].map(([k, v]) => `<div class="meta-row"><span class="meta-k">${k}</span><span class="meta-v">${v}</span></div>`).join('');
  // Freshness relative to the current day (provider pages are regenerated on deploy, not diff-gated).
  const daysAgo = p.verified && p.last_verified
    ? Math.floor((today - new Date(p.last_verified + 'T00:00:00Z')) / 86400000)
    : null;
  const verifiedLine = p.verified
    ? `<span class="v ok">${IC('ic-check')} verified ${htmlEsc(p.last_verified)}${daysAgo != null ? ` · ${daysAgo}d ago` : ''}</span>` +
      (daysAgo != null && daysAgo > FRESH_DAYS ? ` <span class="v warn">${IC('ic-warn')} re-verification due</span>` : '')
    : `<span class="v warn">${IC('ic-warn')} unverified</span>`;
  const docsBtn = p.docs_url ? `<a class="btn primary" href="${htmlEsc(p.docs_url)}" target="_blank" rel="noopener">Official docs ↗</a>` : '';
  const collChips = inColls.length ? `<div class="colls">${inColls.map((c) => `<a href="../collections/${c.slug}.html">${htmlEsc(c.title)}</a>`).join('')}</div>` : '';
  const main =
    `<section class="page-hero"><div class="wrap">` +
    `<nav class="crumbs"><a href="../">Home</a> / <a href="../#explorer">Providers</a> / ${htmlEsc(p.name)}</nav>` +
    `<h1>${htmlEsc(p.name)}</h1>` +
    `<div class="prov-badges"><span class="type">${typeLabel(p)}</span> ${verifiedLine} ${provFlagsHtml(p)}</div>` +
    (p.best_for ? `<p class="lede">${htmlEsc(p.best_for)}</p>` : '') +
    (docsBtn ? `<div class="prov-actions">${docsBtn}</div>` : '') +
    `</div></section>` +
    `<main id="main"><div class="wrap prose">` +
    summary +
    (bigCards ? `<div class="prov-grid">${bigCards}</div>` : '') +
    `<div class="prov-meta">${metaRows}</div>` +
    modelsBlock +
    quick +
    (collChips ? `<h2>Appears in</h2>${collChips}` : '') +
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
    htmlPage({ title: `${p.name} — free tier & limits · Free LLM API Hub`, desc: `${p.name}: ${p.free_tier}`.slice(0, 180), canonical: `${SITE}/p/${p.slug}.html`, main, jsonld })
  );

  writeFileSync(
    join(ROOT, `site/badges/${p.slug}.json`),
    JSON.stringify({ schemaVersion: 1, label: 'free-llm-api-hub', message: p.verified ? `verified ${p.last_verified}` : 'unverified', color: p.verified ? 'brightgreen' : 'yellow' }) + '\n'
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
    title: `${h1} · Free LLM API Hub`, desc: lede.replace(/<[^>]+>/g, ''), canonical: `${SITE}/programs/${slug}.html`,
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
  `\n</tbody></table><p class="muted" style="margin-top:18px">Model lists are a live sample and change often — always confirm against the provider. A provider missing here usually needs an API key to list its models; <a href="${REPO}/blob/main/docs/update-playbook.md">see how the list is refreshed</a>.</p></div></main>` +
  `<script>(function(){var q=document.getElementById('mq'),c=document.getElementById('mshown'),rows=[].slice.call(document.querySelectorAll('.model-table tbody tr'));if(!q)return;q.addEventListener('input',function(){var v=q.value.toLowerCase().trim(),n=0;for(var i=0;i<rows.length;i++){var ok=!v||rows[i].getAttribute('data-s').indexOf(v)>-1;rows[i].hidden=!ok;if(ok)n++;}c.textContent=n;});})();</script>`;
writeFileSync(join(ROOT, 'site/models/index.html'), htmlPage({
  title: 'Free model index — which free API serves which model · Free LLM API Hub',
  desc: `Searchable index of ${modelIndex.length} models available on free LLM & AI-model API tiers, and which provider serves each.`,
  canonical: `${SITE}/models/`,
  main: modelsMain,
}));

// ---------- sitemap.xml (site SEO) ----------
const sitemapUrls = [
  `${SITE}/`,
  `${SITE}/models/`,
  `${SITE}/collections/`,
  `${SITE}/programs/startups.html`,
  `${SITE}/programs/research.html`,
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
  `${verifiedCount} verified, ${freshCount} fresh <${FRESH_DAYS}d → badge ${color}. ` +
  `${COLLECTIONS.length} collections, ${providers.length} provider pages + badges + sitemap generated.`
);
