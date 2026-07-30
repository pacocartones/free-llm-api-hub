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

let readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
readme = inject(readme, 'stats', statsLine);
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
  'card_required', 'commercial_ok', 'openai_compatible', 'verified', 'last_verified',
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

console.log(
  `Built: ${total} providers (${ongoing.length} ongoing, ${trial.length} trial), ` +
  `${verifiedCount} verified, ${freshCount} fresh <${FRESH_DAYS}d → badge ${color}.`
);
