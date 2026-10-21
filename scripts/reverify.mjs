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
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLA_DAYS, ageInDays } from './lib/rules.mjs';
import { weeklyPacing, weeklyBatch } from './lib/pacing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.freebuff', 'reverify');

// Only entries that can be scheduled: verified, with a date to age from.
const verifiedProviders = (providers) =>
  providers
    .filter((p) => p.verified && p.last_verified)
    .sort((a, b) => (a.last_verified < b.last_verified ? -1 : a.last_verified > b.last_verified ? 1 : 0));

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

/**
 * One re-verification pass: pick this week's batch, print it, and — unless
 * `noFetch` — fetch each provider's docs into a dossier under `outDir`.
 *
 * The clock, the network and the output directory are parameters, so the batch
 * logic is testable offline with a fixed date and a stub fetch. The CLI below
 * just calls this with its own arguments.
 *
 * @returns {Promise<{batch: object[], dossiers: {slug: string, file: string, status: string}[]}>}
 */
export async function reverifyBatch(
  providers,
  {
    now = new Date(),
    batchSize = null,
    noFetch = false,
    fetchDocs: fetchImpl = fetchDocs,
    outDir = OUT,
    log = console.log,
  } = {}
) {
  const verified = verifiedProviders(providers);

  // Same batch as the weekly worklist (staleness.mjs, lib/pacing.mjs), unless
  // --batch overrides the size.
  const ageOf = (p) => ageInDays(p.last_verified, now);
  const n = batchSize ?? weeklyPacing(verified.map(ageOf), SLA_DAYS).size;
  const batch = batchSize ? verified.slice(0, n) : weeklyBatch(verified, ageOf, SLA_DAYS, n);

  log(`Re-verification batch — ${batch.length} of ${verified.length} verified (oldest first):\n`);
  for (const p of batch) {
    log(`- ${p.name} (${p.slug}) — ${p.last_verified} (${ageInDays(p.last_verified, now)}d) · ${p.docs_url}`);
  }

  if (noFetch) {
    log('\n--no-fetch: dossiers not written.');
    return { batch, dossiers: [] };
  }

  if (batch.length === 0) {
    // Nothing to fetch: report the empty batch and stop, rather than announcing
    // a fetch and writing an empty dossier directory.
    return { batch, dossiers: [] };
  }

  log('\nFetching provider docs…');
  mkdirSync(outDir, { recursive: true });
  const dossiers = [];
  for (const p of batch) {
    const { status, text } = await fetchImpl(p);
    const dossier = [
      `# ${p.name} (\`${p.slug}\`)`,
      '',
      `- docs: ${p.docs_url}`,
      `- last_verified: ${p.last_verified} (${ageInDays(p.last_verified, now)}d ago) · fetched ${now.toISOString().slice(0, 10)}`,
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
    const file = join(outDir, `${p.slug}.md`);
    writeFileSync(file, dossier);
    dossiers.push({ slug: p.slug, file, status });
    log(`  ✓ ${p.slug} (${status})`);
  }

  log(`\nDossiers written to ${outDir}. Review each, draft the providers.json edit, then run:\n  npm run build && npm test   # commit data/providers.json + regenerated files and open a PR.`);
  return { batch, dossiers };
}

export default reverifyBatch;

if (process.argv[1] && (process.argv[1] === fileURLToPath(import.meta.url) || resolve(process.argv[1]) === fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const batchArg = args.indexOf('--batch');
  const batchSize = batchArg >= 0 ? Number(args[batchArg + 1]) || 6 : null;
  const noFetch = args.includes('--no-fetch');
  const { providers } = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  await reverifyBatch(providers, { batchSize, noFetch });
  if (noFetch) process.exit(0);
}
