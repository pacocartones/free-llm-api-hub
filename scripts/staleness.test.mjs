import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { stalenessWorklist } from './staleness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-10-18T12:00:00Z');

/** Helper to extract provider slugs listed under a markdown section header */
function slugsInSection(markdown, headerPrefix) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => l.startsWith(headerPrefix));
  if (start === -1) return [];
  const slugs = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('### ') || lines[i].startsWith('---')) break;
    const m = lines[i].match(/- \[[ x]\] \*\*[^*]+\*\* \(`([^`]+)`\)/);
    if (m) slugs.push(m[1]);
  }
  return slugs;
}

/** Helper to extract summary numbers: { overdue, dueSoon, unverified, fresh } */
function parseSummary(markdown) {
  const line = markdown.split('\n').find((l) => l.startsWith('**Summary:**'));
  if (!line) return null;
  const m = line.match(/🔴\s*(\d+)\s+overdue\s*·\s*🟡\s*(\d+)\s+due soon\s*·\s*⚠️\s*(\d+)\s+never verified\s*·\s*✅\s*(\d+)\s+fresh/);
  if (!m) return null;
  return {
    overdue: Number(m[1]),
    dueSoon: Number(m[2]),
    unverified: Number(m[3]),
    fresh: Number(m[4]),
  };
}

// Table of cases specified in Issue #462:
// - no last_verified
// - verified today
// - exactly at the 90-day limit
// - one day over
// - a future date
// - an empty dataset
const TABLE_OF_CASES = [
  {
    label: 'no last_verified (unverified provider)',
    providers: [
      { slug: 'no-last-verified', name: 'No Date Provider', verified: false, last_verified: null, notes: 'Awaiting first verification.' },
    ],
    expectedSummary: { overdue: 0, dueSoon: 0, unverified: 1, fresh: 0 },
    expectedOverdue: [],
    expectedDueSoon: [],
    expectedUnverified: ['no-last-verified'],
    expectedBatch: [],
  },
  {
    label: 'verified today (0 days old)',
    providers: [
      { slug: 'verified-today', name: 'Today Provider', verified: true, last_verified: '2026-10-18' },
    ],
    expectedSummary: { overdue: 0, dueSoon: 0, unverified: 0, fresh: 1 },
    expectedOverdue: [],
    expectedDueSoon: [],
    expectedUnverified: [],
    expectedBatch: [],
  },
  {
    label: 'exactly at the 90-day limit',
    // 90 days before 2026-10-18 is 2026-07-20
    providers: [
      { slug: 'at-90-days', name: 'At 90 Days Provider', verified: true, last_verified: '2026-07-20' },
    ],
    expectedSummary: { overdue: 0, dueSoon: 1, unverified: 0, fresh: 0 },
    expectedOverdue: [],
    expectedDueSoon: ['at-90-days'],
    expectedUnverified: [],
    expectedBatch: ['at-90-days'],
  },
  {
    label: 'one day over the 90-day limit (91 days old)',
    // 91 days before 2026-10-18 is 2026-07-19
    providers: [
      { slug: 'at-91-days', name: 'At 91 Days Provider', verified: true, last_verified: '2026-07-19' },
    ],
    expectedSummary: { overdue: 1, dueSoon: 0, unverified: 0, fresh: 0 },
    expectedOverdue: ['at-91-days'],
    expectedDueSoon: [],
    expectedUnverified: [],
    expectedBatch: ['at-91-days'],
  },
  {
    label: 'a future date (negative age)',
    providers: [
      { slug: 'future-date', name: 'Future Provider', verified: true, last_verified: '2026-10-25' },
    ],
    expectedSummary: { overdue: 0, dueSoon: 0, unverified: 0, fresh: 1 },
    expectedOverdue: [],
    expectedDueSoon: [],
    expectedUnverified: [],
    expectedBatch: [],
  },
  {
    label: 'an empty dataset',
    providers: [],
    expectedSummary: { overdue: 0, dueSoon: 0, unverified: 0, fresh: 0 },
    expectedOverdue: [],
    expectedDueSoon: [],
    expectedUnverified: [],
    expectedBatch: [],
  },
];

test('table of cases: each case categorizes into the correct section and summary counts with fixed clock', () => {
  for (const c of TABLE_OF_CASES) {
    const md = stalenessWorklist(c.providers, NOW);
    assert.deepEqual(parseSummary(md), c.expectedSummary, `summary mismatch for case: ${c.label}`);
    assert.deepEqual(slugsInSection(md, '### 🔴 Overdue'), c.expectedOverdue, `overdue mismatch for case: ${c.label}`);
    assert.deepEqual(slugsInSection(md, '### 🟡 Due soon'), c.expectedDueSoon, `due soon mismatch for case: ${c.label}`);
    assert.deepEqual(slugsInSection(md, '### ⚠️ Never independently verified'), c.expectedUnverified, `unverified mismatch for case: ${c.label}`);
    assert.deepEqual(slugsInSection(md, "### 📅 This week's batch"), c.expectedBatch, `batch mismatch for case: ${c.label}`);
  }
});

test('combined dataset: providers appear in the correct sections and in the expected order (oldest first)', () => {
  // Feed providers with reversed order in each category to test sorting
  const providers = [
    // Overdue: newer overdue before older overdue in input array
    { slug: 'overdue-newer-91d', name: 'Overdue 91d', verified: true, last_verified: '2026-07-19' },
    { slug: 'overdue-older-120d', name: 'Overdue 120d', verified: true, last_verified: '2026-06-20' },

    // Due soon: younger due-soon before older due-soon in input array
    { slug: 'due-soon-younger-70d', name: 'Due Soon 70d', verified: true, last_verified: '2026-08-09' },
    { slug: 'due-soon-older-90d', name: 'Due Soon 90d', verified: true, last_verified: '2026-07-20' },

    // Fresh & future (should appear in neither overdue nor due soon nor batch)
    { slug: 'fresh-today', name: 'Fresh Today', verified: true, last_verified: '2026-10-18' },
    { slug: 'fresh-future', name: 'Fresh Future', verified: true, last_verified: '2026-11-01' },

    // Never verified (preserve input order)
    { slug: 'unverified-first', name: 'Unverified 1', verified: false, last_verified: null, notes: 'First unverified note.' },
    { slug: 'unverified-second', name: 'Unverified 2', verified: false, last_verified: null, notes: 'Second unverified note.' },
  ];

  const md = stalenessWorklist(providers, NOW);

  assert.deepEqual(parseSummary(md), {
    overdue: 2,
    dueSoon: 2,
    unverified: 2,
    fresh: 2,
  });

  // Overdue section must be sorted oldest age first (120d before 91d)
  assert.deepEqual(slugsInSection(md, '### 🔴 Overdue'), ['overdue-older-120d', 'overdue-newer-91d']);

  // Due soon section must be sorted oldest age first (90d before 70d)
  assert.deepEqual(slugsInSection(md, '### 🟡 Due soon'), ['due-soon-older-90d', 'due-soon-younger-70d']);

  // Never verified section preserves input order
  assert.deepEqual(slugsInSection(md, '### ⚠️ Never independently verified'), ['unverified-first', 'unverified-second']);

  // Weekly batch prioritizes oldest verifications (forced: > 90d or age + 7 > 90d)
  // With 6 verified providers, pacing size is 3, so only the 3 forced entries are included
  assert.deepEqual(slugsInSection(md, "### 📅 This week's batch"), [
    'overdue-older-120d',
    'overdue-newer-91d',
    'due-soon-older-90d',
  ]);
});

test('weekly batch orders entries oldest verification first', () => {
  const providers = [
    { slug: 'younger-entry', name: 'Younger', verified: true, last_verified: '2026-07-20' }, // 90d ago
    { slug: 'older-entry', name: 'Older', verified: true, last_verified: '2026-06-01' }, // 139d ago
  ];

  const md = stalenessWorklist(providers, NOW);
  assert.deepEqual(slugsInSection(md, "### 📅 This week's batch"), ['older-entry', 'younger-entry']);
});

test('capped 140-entry cohort warns without promising that weekly batches prevent its cliff', () => {
  const providers = Array.from({ length: 140 }, (_, i) => ({
    slug: `cohort-${i}`,
    name: `Cohort ${i}`,
    verified: true,
    last_verified: '2026-07-30', // 80 days old: all 140 cross the SLA together in 10 days
  }));
  const md = stalenessWorklist(providers, NOW);
  const cliff = md.split('\n').find((line) => line.startsWith('> ⛰️ **Cliff watch:**'));
  const batchNote = md.split('\n').find((line) => line.startsWith('_The 11 oldest verifications'));

  assert.match(md, /> ⚠️ \*\*Behind pace:\*\* even 11 re-verifications a week will not keep every entry inside the SLA/);
  assert.equal(slugsInSection(md, "### 📅 This week's batch").length, 11);
  assert.match(cliff, /140 entries/);
  assert.match(cliff, /capped at 11; completing it may not spread every entry before then/);
  assert.doesNotMatch(cliff, /doing every batch spreads them out before then/);
  assert.match(batchNote, /one batch a week cannot keep every entry inside the 90-day SLA/);
  assert.doesNotMatch(batchNote, /Doing one batch every week keeps every entry inside/);
  assert.doesNotMatch(batchNote, /no week inherits a cliff/);
});

test('reachable cohort retains the weekly SLA explanation', () => {
  const providers = Array.from({ length: 20 }, (_, i) => ({
    slug: `reachable-${i}`,
    name: `Reachable ${i}`,
    verified: true,
    last_verified: '2026-07-30',
  }));
  const md = stalenessWorklist(providers, NOW);
  const cliff = md.split('\n').find((line) => line.startsWith('> ⛰️ **Cliff watch:**'));
  const batchNote = md.split('\n').find((line) => line.startsWith('_The 10 oldest verifications'));

  assert.doesNotMatch(md, /\*\*Behind pace:\*\*/);
  assert.equal(slugsInSection(md, "### 📅 This week's batch").length, 10);
  assert.match(cliff, /doing every batch spreads them out before then/);
  assert.match(batchNote, /Doing one batch every week keeps every entry inside/);
});

test('empty dataset renders placeholder text for all sections and zero summary', () => {
  const md = stalenessWorklist([], NOW);
  assert.match(md, /\*\*Summary:\*\* 🔴 0 overdue · 🟡 0 due soon · ⚠️ 0 never verified · ✅ 0 fresh\./);
  assert.match(md, /### 🔴 Overdue \(>90 days\) — 0\n_None — the list is within SLA\._/);
  assert.match(md, /### 🟡 Due soon \(61–90 days\) — 0\n_None\._/);
  assert.match(md, /### ⚠️ Never independently verified — 0\n_None\._/);
  assert.match(md, /### 📅 This week's batch — 0\n[^\n]+\n_None\._/);
});

test('top-level CLI execution matches stalenessWorklist on data/providers.json and exits 0', () => {
  const cliOutput = execFileSync('node', [join(ROOT, 'scripts/staleness.mjs')], { encoding: 'utf8' });
  const data = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));

  // staleness.mjs reads new Date() when run as CLI, so pass today's date
  // CLI output must match stalenessWorklist(data.providers) exactly
  assert.ok(cliOutput.includes('_Generated from `data/providers.json`'));
  assert.ok(cliOutput.includes('**Summary:**'));
  assert.ok(cliOutput.includes("### 📅 This week's batch"));
  assert.ok(cliOutput.includes('### 🔴 Overdue'));
  assert.ok(cliOutput.includes('### 🟡 Due soon'));
  assert.ok(cliOutput.includes('### ⚠️ Never independently verified'));
});
