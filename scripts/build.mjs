#!/usr/bin/env node
// Regenerates every derived artifact from the single source of truth: data/providers.json.
//   - README provider tables (between AUTOGEN markers)
//   - badge-freshness.json (root, for the shields.io endpoint badge)
//   - data/providers.csv and data/providers.yaml (portable exports)
//   - site/providers.json (+ csv/yaml) so the interactive site ships the data
// Zero dependencies. Run with: node scripts/build.mjs   (or `npm run build`)

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
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
</defs></svg>`;
const IC = (id) => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;

const siteHeader = (p) => `<header class="site-header"><div class="wrap header-inner">
<a class="brand" href="${p}" aria-label="Free LLM API Hub — home"><svg class="logo-mark"><use href="#logo"/></svg><span class="brand-name">Free LLM API <span class="grad">Hub</span></span></a>
<nav class="nav" aria-label="Primary"><a href="${p}#explorer">Explorer</a><a href="${p}collections/">Collections</a><a href="${REPO}/blob/main/docs/methodology.md">Methodology</a><a href="${p}providers.json">Dataset</a></nav>
<div class="header-actions">
<a class="icon-btn" href="${REPO}" target="_blank" rel="noopener" aria-label="Star on GitHub">${GH_ICON}<span class="star-count" data-stars>★</span></a>
<button class="icon-btn theme-toggle" id="themeToggle" aria-label="Toggle light and dark theme" title="Toggle theme"><svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><svg class="moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg></button>
</div></div></header>`;

const siteFooter = (p) => `<footer class="site-footer"><div class="wrap footer-top">
<div class="footer-brand"><a class="brand" href="${p}"><svg class="logo-mark"><use href="#logo"/></svg><span class="brand-name">Free LLM API <span class="grad">Hub</span></span></a><p>A continuously-verified, machine-readable dataset of free LLM APIs and trial credits for developers.</p></div>
<div class="footer-col"><h4>Explore</h4><a href="${p}#explorer">Interactive explorer</a><a href="${p}collections/">Collections</a><a href="${REPO}#notably-not-free">Notably NOT free</a></div>
<div class="footer-col"><h4>Data</h4><a href="${p}providers.json">providers.json</a><a href="${p}providers.csv">CSV export</a><a href="${p}providers.yaml">YAML export</a><a href="${REPO}/blob/main/data/schema.json">JSON Schema</a></div>
<div class="footer-col"><h4>Project</h4><a href="${REPO}/blob/main/docs/methodology.md">Methodology</a><a href="${REPO}/blob/main/CONTRIBUTING.md">Contributing</a><a href="${REPO}/blob/main/CHANGELOG.md">Changelog</a><a href="${REPO}">GitHub ★</a></div>
</div><div class="wrap footer-bottom">Independent, community-maintained — not affiliated with any provider listed. Terms change without notice; always confirm against each provider's own docs. <a href="${REPO}/blob/main/LICENSE">MIT licensed</a>.</div></footer>`;

// Full page wrapper for generated (collection) pages. `p` is the path prefix to the site root.
function htmlPage({ title, desc, canonical, main, jsonld, prefix = '../' }) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${htmlEsc(title)}</title>
<meta name="description" content="${htmlEsc(desc)}">
<script>(function(){try{var t=localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
<link rel="canonical" href="${htmlEsc(canonical)}">
<link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
<link rel="preload" href="${prefix}fonts/jetbrains-mono-700.woff2" as="font" type="font/woff2" crossorigin>
<meta name="theme-color" content="#0a0d0b">
<meta property="og:title" content="${htmlEsc(title)}">
<meta property="og:description" content="${htmlEsc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${htmlEsc(canonical)}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}/og.png">
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

let readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
readme = inject(readme, 'stats', statsLine);
readme = inject(readme, 'collections', collectionsIndexMd);
readme = inject(readme, 'ongoing', ongoingTable(ongoing));
readme = inject(readme, 'trial', trialTable(trial));
writeFileSync(join(ROOT, 'README.md'), readme);

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
  'best_for', 'modalities', 'expires', 'docs_url', 'phone_required',
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
    if (c === 'modalities') return `${prefix}${c}: [${(p.modalities || []).map((m) => JSON.stringify(m)).join(', ')}]`;
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
    htmlPage({ title: `${c.title} · Free LLM API Hub`, desc: c.desc, canonical: `${SITE}/collections/${c.slug}.html`, main, jsonld })
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
  const badgeUrl = `https://img.shields.io/endpoint?url=${SITE}/badges/${p.slug}.json`;
  const embed = `[![${p.name} — free tier, tracked by Free LLM API Hub](${badgeUrl})](${SITE}/p/${p.slug}.html)`;
  const model = p.slug === 'groq' ? 'llama-3.1-8b-instant' : '<a-free-model>';
  const quick = p.openai_base_url
    ? `<h2>Quickstart — OpenAI SDK</h2><pre><code>from openai import OpenAI

client = OpenAI(base_url="${htmlEsc(p.openai_base_url)}", api_key="&lt;YOUR_FREE_API_KEY&gt;")
resp = client.chat.completions.create(
    model="${htmlEsc(model)}",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)</code></pre>`
    : '';
  const fields = [
    ["What's free", htmlEsc(p.free_tier)],
    ['Rate limits', htmlEsc(p.rate_limits)],
    ['The catch', htmlEsc(p.notes)],
    ['Modalities', (p.modalities || []).join(', ')],
    ['Free type', htmlEsc(p.free_type)],
    ['Expires', htmlEsc(p.expires)],
    ['OpenAI base URL', p.openai_base_url ? `<code>${htmlEsc(p.openai_base_url)}</code>` : ''],
  ].filter(([, v]) => v);
  const cards = fields.map(([k, v]) => `<div class="prov-card"><h3>${k}</h3><p>${v}</p></div>`).join('');
  const verifiedLine = p.verified
    ? `<span class="v ok">${IC('ic-check')} verified ${htmlEsc(p.last_verified)}</span>`
    : `<span class="v warn">${IC('ic-warn')} unverified</span>`;
  const collLinks = inColls.map((c) => `<a href="../collections/${c.slug}.html">${htmlEsc(c.title)}</a>`).join(' · ') || '—';
  const main =
    `<section class="page-hero"><div class="wrap">` +
    `<nav class="crumbs"><a href="../">Home</a> / <a href="../#explorer">Providers</a> / ${htmlEsc(p.name)}</nav>` +
    `<h1>${htmlEsc(p.name)}</h1>` +
    `<div class="prov-badges"><span class="type">${typeLabel(p)}</span> ${verifiedLine} ${provFlagsHtml(p)}</div>` +
    (p.best_for ? `<p class="lede">${htmlEsc(p.best_for)}</p>` : '') +
    `</div></section>` +
    `<main id="main"><div class="wrap prose">` +
    `<div class="prov-grid">${cards}</div>` +
    quick +
    `<h2>Source &amp; embed</h2>` +
    `<p><a href="${htmlEsc(p.docs_url)}" target="_blank" rel="noopener">Official docs ↗</a> &nbsp;·&nbsp; Appears in: ${collLinks}</p>` +
    `<p class="count">Embed this provider's freshness badge in your README:</p><pre><code>${htmlEsc(embed)}</code></pre>` +
    `<p><a href="../#explorer">← Back to all providers</a></p>` +
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

// ---------- sitemap.xml (site SEO) ----------
const sitemapUrls = [
  `${SITE}/`,
  `${SITE}/collections/`,
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
