#!/usr/bin/env node
// Emits a Markdown re-verification worklist from data/providers.json.
// On-demand local tool (no scheduled workflow): turns the 90-day freshness policy
// into an actionable checklist for the next re-verification pass. Report-only (never fails).
// Run with: node scripts/staleness.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SLA_DAYS, DUE_SOON_DAYS, ageInDays, freshnessStatus } from './lib/rules.mjs';
import { weeklyPacing, weeklyBatch, WEEKLY_CAP, MIN_AGE_DAYS } from './lib/pacing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Same bucketing the freshness badge is graded on — imported from rules.mjs, not
// re-declared, so the worklist and the badge can never disagree on an entry.
const DUE_SOON = DUE_SOON_DAYS;
const OVERDUE = SLA_DAYS;

const { providers } = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const today = new Date();
const ageDays = (d) => ageInDays(d, today);
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
  const status = freshnessStatus(age);
  if (status === 'stale') overdue.push({ p, age });
  else if (status === 'due') dueSoon.push({ p, age });
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

// Weekly batch: the smallest size that keeps every entry inside the SLA if
// each week's batch is done, oldest first, capped at a week of work (see
// lib/pacing.mjs). Taking the oldest each week re-verifies part of any
// same-day cohort early, which is what spreads it out.
const verifiedList = providers
  .filter((p) => p.verified && p.last_verified)
  .sort((a, b) => (a.last_verified < b.last_verified ? -1 : 1) || (a.slug < b.slug ? -1 : 1));
const pacing = weeklyPacing(verifiedList.map((p) => ageDays(p.last_verified)), OVERDUE);
const batch = weeklyBatch(verifiedList, (p) => ageDays(p.last_verified), OVERDUE, pacing.size);

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
if (pacing.capped) {
  out.push(`> ⚠️ **Behind pace:** even ${WEEKLY_CAP} re-verifications a week will not keep every entry inside the SLA. Do an extra batch this week, or expect some entries to go overdue.`);
  out.push('');
}
if (cliff && cliff.crossIn > 0) {
  out.push(`> ⛰️ **Cliff watch:** ${cliff.n} entries were all verified on ${cliff.d} and cross the ${OVERDUE}-day SLA together around **${cliff.crossOn}** (~${cliff.crossIn} days). The weekly batch is sized (${pacing.size} a week) so that doing every batch spreads them out before then.`);
  out.push('');
}

out.push(`### 📅 This week's batch — ${batch.length}`);
out.push(`_The ${batch.length} oldest verifications that are at least ${MIN_AGE_DAYS} days old (sized at ${pacing.size}, at most ${WEEKLY_CAP} a week). Doing one batch every week keeps every entry inside the ${OVERDUE}-day SLA and spreads same-day cohorts out, so no week inherits a cliff._`);
out.push(batch.map((p) => `- [ ] **${p.name}** (\`${p.slug}\`) — last verified ${p.last_verified} (${ageDays(p.last_verified)} days ago)` + (p.docs_url ? ` · [docs](${p.docs_url})` : '')).join('\n') || '_None._');
out.push('');

out.push(`### 🔴 Overdue (>${OVERDUE} days) — ${overdue.length}`);
out.push(overdue.length ? overdue.map(line).join('\n') : '_None — the list is within SLA._');
out.push('');
out.push(`### 🟡 Due soon (${DUE_SOON + 1}–${OVERDUE} days) — ${dueSoon.length}`);
out.push(dueSoon.length ? dueSoon.map(line).join('\n') : '_None._');
out.push('');
out.push(`### ⚠️ Never independently verified — ${unverified.length}`);
out.push(unverified.length ? unverified.map(uline).join('\n') : '_None._');
out.push('');
out.push('---');
out.push("**To clear an item:** re-check the provider's own docs, update the entry in `data/providers.json` (numbers + `last_verified` = today, or set `verified: false` with a note), run `npm run build && npm test`, and open a PR. Full ritual: [docs/update-playbook.md](../blob/main/docs/update-playbook.md).");

console.log(out.join('\n'));
