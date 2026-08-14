#!/usr/bin/env node
// generate-gfis.mjs — keep the tri-state umbrella issues (#7 phone_required,
// #8 commercial_ok) in lockstep with data/providers.json.
//
// The per-provider good-first issues are opened once by hand; what drifts is
// the UMBRELLA (the count in the title and the checklist in the body), every
// time a re-verification batch resolves a field from `null` to true/false.
// This script recomputes the gaps and refreshes #7 and #8 so the numbers can
// never go stale again.
//
//   node scripts/generate-gfis.mjs          # report only — what WOULD change
//   node scripts/generate-gfis.mjs --sync   # update #7 and #8 via `gh`
//
// Requires `gh` on PATH (only for --sync). Idempotent: re-running after --sync
// reports no change. It never closes issues and never touches the per-provider
// GFIs — those are claimed by contributors, not regenerated.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'pacocartones/free-llm-api-hub';
const { providers } = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const sync = process.argv.includes('--sync');

const UMBRELLAS = [
  { issue: 7, field: 'phone_required', title: 'Confirm phone_required' },
  { issue: 8, field: 'commercial_ok', title: 'Confirm commercial_ok' },
];

const nullRows = (field) =>
  providers
    .filter((p) => p[field] === null)
    .map((p) => ({ slug: p.slug, docs: p.docs_url }))
    .sort((a, b) => (a.slug < b.slug ? -1 : 1));

const statusSection = (rows) =>
  `## Status: ${rows.length} entries at \`null\` (verified ${today})\n\n` +
  rows.map((r) => `- [ ] \`${r.slug}\` — ${r.docs}`).join('\n') + '\n';

const gh = (args) => execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8' });

let changed = false;
for (const u of UMBRELLAS) {
  const rows = nullRows(u.field);
  const title = `[tri-state] ${u.title} — ${rows.length} unverified entries`;
  const current = JSON.parse(gh(['issue', 'view', String(u.issue), '--repo', REPO, '--json', 'title,body', '-q', '.']));
  if (current.title === title) {
    console.log(`#${u.issue} ${u.field}: up to date (${rows.length} null)`);
    continue;
  }
  changed = true;
  console.log(`#${u.issue} ${u.field}: ${current.title.replace(/.*— /, '')} -> ${rows.length} null`);
  if (!sync) continue;

  // Replace the stale "## Status: ..." section (and everything after it) with
  // the fresh checklist; keep the "what / why / how" prose above it untouched.
  const idx = current.body.indexOf('## Status:');
  const body = (idx === -1 ? current.body : current.body.slice(0, idx)) + statusSection(rows);
  const tmp = join(tmpdir(), `gfi-${u.issue}.md`);
  writeFileSync(tmp, body);
  gh(['issue', 'edit', String(u.issue), '--repo', REPO, '--title', title, '--body-file', tmp]);
  console.log(`#${u.issue} updated.`);
}

if (!changed) console.log('Both umbrella issues are current — nothing to do.');
if (!sync && changed) console.log('\nRun with --sync to apply the changes.');
