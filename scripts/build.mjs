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
    if (p.card_required === false) parts.push('💳 no card');
    if (p.phone_required === false) parts.push('📵 no phone');
    if (p.phone_required === true) parts.push('📱 phone');
    if (p.commercial_ok === true) parts.push('🏢 commercial OK');
    if (p.commercial_ok === false) parts.push('🔬 eval only');
    if (p.openai_compatible === true) parts.push('🔌 OpenAI-compat');
    return parts.length ? `<div class="flags">${parts.map((t) => `<span>${t}</span>`).join('')}</div>` : '';
  };
  const col2Head = bu ? 'OpenAI base URL' : 'Type';
  const rowsHtml = rows
    .map((p) => {
      const name = p.docs_url
        ? `<a href="${htmlEsc(p.docs_url)}" target="_blank" rel="noopener">${htmlEsc(p.name)}</a>`
        : htmlEsc(p.name);
      const v = p.verified
        ? `<span class="v ok">✅ ${htmlEsc(p.last_verified)}</span>`
        : '<span class="v warn">⚠️ unverified</span>';
      const col2 = bu
        ? (p.openai_base_url ? `<code>${htmlEsc(p.openai_base_url)}</code>` : '<span class="notes">see docs</span>')
        : `<span class="type">${typeLabel(p)}</span>`;
      return `<tr><td class="name">${name}${flagsHtml(p)}</td><td>${col2}</td><td>${htmlEsc(p.free_tier)}</td><td class="notes">${htmlEsc(p.notes)}</td><td>${v}</td></tr>`;
    })
    .join('\n');
  return `<table><thead><tr><th>Provider</th><th>${col2Head}</th><th>What's free</th><th>The catch</th><th>Verified</th></tr></thead><tbody>\n${rowsHtml}\n</tbody></table>`;
}

function htmlPage({ title, desc, canonical, bodyHtml, jsonld }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${htmlEsc(title)}</title>
<meta name="description" content="${htmlEsc(desc)}">
<link rel="canonical" href="${htmlEsc(canonical)}">
<meta property="og:title" content="${htmlEsc(title)}">
<meta property="og:description" content="${htmlEsc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${htmlEsc(canonical)}">
<style>
  :root{--bg:#0b0e14;--panel:#12161f;--border:#262c38;--text:#e6edf3;--muted:#8b95a5;--accent:#6ea8fe;--green:#3fb950;--yellow:#d29922;--purple:#bc8cff}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Helvetica,Arial,sans-serif;line-height:1.55}
  a{color:var(--accent)}.wrap{max-width:1080px;margin:0 auto;padding:0 24px}
  header{border-bottom:1px solid var(--border);background:radial-gradient(1000px 320px at 50% -120px,rgba(110,168,254,.14),transparent 70%);padding:40px 0 26px}
  h1{font-size:clamp(1.6rem,3.5vw,2.4rem);margin:0 0 12px;letter-spacing:-.02em}
  .lede{color:var(--muted);max-width:70ch;margin:0 0 18px}
  nav.crumbs{font-size:.9rem;margin-bottom:8px}nav.crumbs a{color:var(--muted)}
  nav.colls{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0}
  nav.colls a{font-size:.85rem;padding:5px 11px;border:1px solid var(--border);border-radius:999px;background:var(--panel);text-decoration:none}
  nav.colls a.active{border-color:var(--accent);color:var(--accent)}
  main{padding:24px 0 60px}
  table{width:100%;border-collapse:collapse;font-size:.9rem}
  thead th{text-align:left;padding:10px 12px;border-bottom:2px solid var(--border);color:var(--muted);font-weight:600;white-space:nowrap}
  tbody td{padding:13px 12px;border-bottom:1px solid var(--border);vertical-align:top}
  tbody tr:hover{background:var(--panel)}.name a{color:var(--text);font-weight:600;text-decoration:none}.name a:hover{color:var(--accent)}
  .flags{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}.flags span{font-size:.72rem;color:#5b6472}
  .type{font-size:.72rem;padding:2px 8px;border-radius:999px;background:rgba(110,168,254,.14);color:var(--accent);border:1px solid rgba(110,168,254,.35)}
  .notes{color:var(--muted);font-size:.85rem;max-width:44ch}
  .v{font-size:.72rem;padding:2px 8px;border-radius:999px;white-space:nowrap}.v.ok{background:rgba(63,185,80,.14);color:var(--green);border:1px solid rgba(63,185,80,.35)}.v.warn{background:rgba(210,153,34,.14);color:var(--yellow);border:1px solid rgba(210,153,34,.35)}
  pre{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:16px;overflow:auto;font-size:.85rem}
  h2{margin-top:36px}.count{color:var(--muted);font-size:.85rem;margin:6px 0 16px}
  footer{border-top:1px solid var(--border);color:var(--muted);font-size:.85rem;padding:24px 0 60px}
</style>
${jsonld ? `<script type="application/ld+json">${jsonld}</script>` : ''}
</head>
<body>
${bodyHtml}
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
    (o) => `<a href="${o.slug}.html"${o.slug === c.slug ? ' class="active"' : ''}>${htmlEsc(o.title)}</a>`
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
    '@type': 'ItemList',
    name: c.h1,
    description: c.desc,
    numberOfItems: rows.length,
    itemListElement: rows.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: p.name,
      url: p.docs_url || undefined,
    })),
  });
  const body =
    `<header><div class="wrap">` +
    `<nav class="crumbs"><a href="../">Free LLM API Hub</a> / <a href="index.html">Collections</a> / ${htmlEsc(c.title)}</nav>` +
    `<h1>${htmlEsc(c.h1)}</h1><p class="lede">${htmlEsc(c.desc)}</p>` +
    `<nav class="colls">${nav}</nav></div></header>` +
    `<main><div class="wrap">` +
    `<p>${htmlEsc(c.intro).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</p>` +
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
    `</div></main>` +
    `<footer><div class="wrap">Generated from <a href="../providers.json">providers.json</a>. Independent, community-maintained — not affiliated with any provider. Source & methodology on <a href="https://github.com/pacocartones/free-llm-api-hub">GitHub</a>.</div></footer>`;
  writeFileSync(
    join(ROOT, `site/collections/${c.slug}.html`),
    htmlPage({ title: `${c.title} · Free LLM API Hub`, desc: c.desc, canonical: `${SITE}/collections/${c.slug}.html`, bodyHtml: body, jsonld })
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
const hubBody =
  `<header><div class="wrap">` +
  `<nav class="crumbs"><a href="../">Free LLM API Hub</a> / Collections</nav>` +
  `<h1>Collections</h1><p class="lede">Curated, always-current slices of the dataset — filter the list by a single constraint you actually have.</p>` +
  `<nav class="colls">${COLLECTIONS.map((c) => `<a href="${c.slug}.html">${htmlEsc(c.title)}</a>`).join('')}</nav>` +
  `</div></header><main><div class="wrap"><ul>` +
  COLLECTIONS.map((c) => `<li style="margin:12px 0"><a href="${c.slug}.html"><strong>${htmlEsc(c.title)}</strong></a> — ${htmlEsc(c.desc)} <span class="count">(${collRows(c).length})</span></li>`).join('') +
  `</ul></div></main><footer><div class="wrap"><a href="../">← Interactive explorer</a> · <a href="https://github.com/pacocartones/free-llm-api-hub">GitHub</a></div></footer>`;
writeFileSync(
  join(ROOT, 'site/collections/index.html'),
  htmlPage({ title: 'Collections · Free LLM API Hub', desc: 'Curated, always-current collections of free LLM APIs by constraint: no card, no phone, commercial use, OpenAI-compatible, permanently free, multimodal.', canonical: `${SITE}/collections/`, bodyHtml: hubBody })
);

// ---------- sitemap.xml (site SEO) ----------
const sitemapUrls = [
  `${SITE}/`,
  `${SITE}/collections/`,
  ...COLLECTIONS.map((c) => `${SITE}/collections/${c.slug}.html`),
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
  `${COLLECTIONS.length} collections + sitemap generated.`
);
