#!/usr/bin/env node
// Emits a Markdown re-verification worklist from data/providers.json.
// The weekly maintenance workflow captures this and opens/updates a tracking issue,
// turning the 90-day freshness policy into an actionable checklist. Report-only (never fails).
// Run with: node scripts/staleness.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DUE_SOON = 60; // days
const OVERDUE = 90; // days — the freshness SLA

const { providers } = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const today = new Date();
const ageDays = (d) => Math.floor((today - new Date(d + 'T00:00:00Z')) / 86400000);
const firstSentence = (s) => (s || '').split(/(?<=\.)\s/)[0].slice(0, 160);

const overdue = [];
const dueSoon = [];
const unverified = [];

for (const p of providers) {
  if (!p.verified) {
    unverified.push(p);
    continue;
  }
  const age = ageDays(p.last_verified);
  if (age > OVERDUE) overdue.push({ p, age });
  else if (age >= DUE_SOON) dueSoon.push({ p, age });
}
overdue.sort((a, b) => b.age - a.age);
dueSoon.sort((a, b) => b.age - a.age);

// Cliff watch: many entries sharing one verification date cross the 90-day SLA together.
const CLIFF_MIN = 8;
const byDate = {};
for (const p of providers) if (p.verified && p.last_verified) byDate[p.last_verified] = (byDate[p.last_verified] || 0) + 1;
let cliff = null;
for (const [d, n] of Object.entries(byDate)) {
  if (n < CLIFF_MIN) continue;
  const crossIn = OVERDUE - ageDays(d); // days until this cluster crosses the SLA
  const crossOn = new Date(new Date(d + 'T00:00:00Z').getTime() + OVERDUE * 86400000).toISOString().slice(0, 10);
  if (!cliff || n > cliff.n) cliff = { d, n, crossIn, crossOn };
}

const line = ({ p, age }) =>
  `- [ ] **${p.name}** (\`${p.slug}\`) — last verified ${p.last_verified} (${age} days ago)` +
  (p.docs_url ? ` · [docs](${p.docs_url})` : '');
const uline = (p) =>
  `- [ ] **${p.name}** (\`${p.slug}\`) — ${firstSentence(p.notes) || 'needs first independent verification'}` +
  (p.docs_url ? ` · [docs](${p.docs_url})` : '');

const out = [];
out.push(`_Generated from \`data/providers.json\`. Freshness SLA: every verified entry re-confirmed against the provider's own docs within ${OVERDUE} days._`);
out.push('');
out.push(`**Summary:** 🔴 ${overdue.length} overdue · 🟡 ${dueSoon.length} due soon · ⚠️ ${unverified.length} never verified · ✅ ${providers.length - overdue.length - dueSoon.length - unverified.length} fresh.`);
out.push('');
if (cliff && cliff.crossIn <= 45) {
  out.push(`> ⛰️ **Cliff watch:** ${cliff.n} entries were all verified on ${cliff.d} and cross the ${OVERDUE}-day SLA together around **${cliff.crossOn}** (~${cliff.crossIn} days). Re-verify a few of them early each week to spread the load instead of taking the hit all at once.`);
  out.push('');
}

out.push(`### 🔴 Overdue (>${OVERDUE} days) — ${overdue.length}`);
out.push(overdue.length ? overdue.map(line).join('\n') : '_None — the list is within SLA._');
out.push('');
out.push(`### 🟡 Due soon (${DUE_SOON}–${OVERDUE} days) — ${dueSoon.length}`);
out.push(dueSoon.length ? dueSoon.map(line).join('\n') : '_None._');
out.push('');
out.push(`### ⚠️ Never independently verified — ${unverified.length}`);
out.push(unverified.length ? unverified.map(uline).join('\n') : '_None._');
out.push('');
out.push('---');
out.push("**To clear an item:** re-check the provider's own docs, update the entry in `data/providers.json` (numbers + `last_verified` = today, or set `verified: false` with a note), run `npm run build && npm test`, and open a PR. Full ritual: [docs/update-playbook.md](../blob/main/docs/update-playbook.md).");

console.log(out.join('\n'));
