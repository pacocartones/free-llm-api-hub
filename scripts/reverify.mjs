#!/usr/bin/env node
// reverify.mjs — local, on-demand re-verification pass (Layer 3 of the playbook).
//
// No GitHub Actions: runs on the machine you control. When the freshness batch
// is due, run:
//   node scripts/reverify.mjs              # print this week's batch (no fetch)
//   node scripts/reverify.mjs --batch 12   # override the batch size
//   node scripts/reverify.mjs --fetch-for-human-review # fetch human-only dossiers
//
// The default mode never fetches remote content. With the explicit human-review
// flag, it writes provider-controlled text to
// .freebuff/reverify-human-only/<slug>.md (gitignored, local only). A human
// reads those dossiers and drafts the data edit. Raw dossiers must never enter
// an LLM or tool-capable agent context; automation may resume only after the
// human has produced the trusted repository edit.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLA_DAYS, ageInDays } from './lib/rules.mjs';
import { weeklyPacing, weeklyBatch } from './lib/pacing.mjs';
import { reverifyDossier } from './lib/reverify-dossier.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.freebuff', 'reverify-human-only');

const args = process.argv.slice(2);
const batchArg = args.indexOf('--batch');
const batchSize = batchArg >= 0 ? Number(args[batchArg + 1]) || 6 : null;
const fetchForHumanReview = args.includes('--fetch-for-human-review') && !args.includes('--no-fetch');

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

// Single-pass entity decode: one regex + callback, so entities are never
// double-unescaped (e.g. &amp;amp; -> &amp;, not &).
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decodeEntities = (s) => s.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] || m);
const stripHtml = (html) => {
  // Tolerant of whitespace AND stray attributes inside tags (e.g. <script >,
  // </script bar>), so a malformed end tag cannot leave script content behind.
  const s = decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
  ).trim();
  return s.length > 6000 ? s.slice(0, 6000) + '…' : s;
};

const fetchDocs = async (p) => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(p.docs_url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; free-llm-api-hub-reverify/1.0)' },
    });
    clearTimeout(t);
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) return { status: `HTTP ${res.status}`, text: '' };
    const body = await res.text();
    return { status: String(res.status), text: /html|text|markdown/.test(ct) ? stripHtml(body) : '(non-text body — review manually)' };
  } catch (e) {
    return { status: `fetch error: ${e.name === 'AbortError' ? 'timeout' : e.message}`, text: '' };
  }
};

console.log(`Re-verification batch — ${batch.length} of ${verified.length} verified (oldest first):\n`);
for (const p of batch) {
  console.log(`- ${p.name} (${p.slug}) — ${p.last_verified} (${ageInDays(p.last_verified)}d) · ${p.docs_url}`);
}

if (!fetchForHumanReview) {
  console.log('\nRemote content was not fetched. A human reviewer may use --fetch-for-human-review; never give the resulting dossiers to an LLM or tool-capable agent.');
  process.exit(0);
}

console.log('\nFetching provider docs for human review only…');
mkdirSync(OUT, { recursive: true });
for (const p of batch) {
  const { status, text } = await fetchDocs(p);
  const dossier = reverifyDossier(p, {
    status,
    text,
    fetchedOn: new Date().toISOString().slice(0, 10),
    ageDays: ageInDays(p.last_verified),
  });
  writeFileSync(join(OUT, `${p.slug}.md`), dossier);
  console.log(`  ✓ ${p.slug} (${status})`);
}

console.log(`\nHuman-only dossiers written to ${OUT}. A human must review them and draft the providers.json edit. Never provide these files to an LLM or tool-capable agent.`);
