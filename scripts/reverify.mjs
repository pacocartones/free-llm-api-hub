#!/usr/bin/env node
// reverify.mjs — local, on-demand re-verification pass (Layer 3 of the playbook).
//
// No GitHub Actions: runs on the machine you control. When the freshness batch
// is due, run:
//   node scripts/reverify.mjs              # fetch dossiers for this week's batch
//   node scripts/reverify.mjs --batch 12   # override the batch size
//   node scripts/reverify.mjs --no-fetch   # just print the batch (offline)
//
// For each provider in the batch it fetches the provider's own docs_url and
// writes a review dossier to .freebuff/reverify/<slug>.md (gitignored, local
// only). An agent reads each dossier, compares the fetched docs against the
// entry in data/providers.json, and drafts the edit; a human then runs
// `npm run build && npm test` and opens the PR. This script never edits data
// by itself — the primary-source + real-date rule stays a human/agent judgment.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLA_DAYS, ageInDays } from './lib/rules.mjs';
import { weeklyPacing, weeklyBatch } from './lib/pacing.mjs';
import { fetchDocs } from './lib/reverify-fetch.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.freebuff', 'reverify');

const args = process.argv.slice(2);
const batchArg = args.indexOf('--batch');
const batchSize = batchArg >= 0 ? Number(args[batchArg + 1]) || 6 : null;
const noFetch = args.includes('--no-fetch');

const { providers } = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const verified = providers
  .filter((p) => p.verified && p.last_verified)
  .sort((a, b) => (a.last_verified < b.last_verified ? -1 : a.last_verified > b.last_verified ? 1 : 0));

// Same batch as the weekly worklist (staleness.mjs, lib/pacing.mjs), unless
// --batch overrides the size.
const today = new Date();
const ageOf = (p) => ageInDays(p.last_verified, today);
const n = batchSize ?? weeklyPacing(verified.map(ageOf), SLA_DAYS).size;
const batch = batchSize ? verified.slice(0, n) : weeklyBatch(verified, ageOf, SLA_DAYS, n);

console.log(`Re-verification batch — ${batch.length} of ${verified.length} verified (oldest first):\n`);
for (const p of batch) {
  console.log(`- ${p.name} (${p.slug}) — ${p.last_verified} (${ageInDays(p.last_verified)}d) · ${p.docs_url}`);
}

if (noFetch) { console.log('\n--no-fetch: dossiers not written.'); process.exit(0); }

console.log('\nFetching provider docs…');
mkdirSync(OUT, { recursive: true });
for (const p of batch) {
  const { status, text } = await fetchDocs(p);
  const dossier = [
    `# ${p.name} (\`${p.slug}\`)`,
    '',
    `- docs: ${p.docs_url}`,
    `- last_verified: ${p.last_verified} (${ageInDays(p.last_verified)}d ago) · fetched ${new Date().toISOString().slice(0, 10)}`,
    `- fetch status: ${status}`,
    '',
    '## Current entry',
    `- free_tier: ${p.free_tier}`,
    `- rate_limits: ${p.rate_limits || ''}`,
    `- notes: ${p.notes || ''}`,
    `- flags: card=${p.card_required} phone=${p.phone_required} commercial=${p.commercial_ok} openai=${p.openai_compatible}`,
    `- best_for: ${p.best_for || ''}`,
    `- expires: ${p.expires || ''}`,
    ...(p.data_policy ? [`- data_policy: trains_on_prompts=${p.data_policy.trains_on_prompts} retention=${p.data_policy.retention || ''} (${p.data_policy.source}, read ${p.data_policy.checked}): read it again`] : []),
    ...(p.no_expiry ? [`- no_expiry: the provider said "${p.no_expiry.quote}" (${p.no_expiry.source}, read ${p.no_expiry.checked}): read it again`] : []),
    '',
    '## Provider docs (extracted text)',
    '',
    text || '(nothing extracted — review the docs manually)',
    '',
  ].join('\n');
  writeFileSync(join(OUT, `${p.slug}.md`), dossier);
  console.log(`  ✓ ${p.slug} (${status})`);
}

console.log(`\nDossiers written to ${OUT}. Review each, draft the providers.json edit, then run:\n  npm run build && npm test   # commit data/providers.json + regenerated files and open a PR.`);
