// discover.mjs — surface NEW free models & publishers from OpenRouter's live
// `:free` catalog, as discovery leads for the new-provider worklist.
//
// This is a MAINTENANCE / research script (like staleness.mjs and
// fetch-models.mjs), NOT part of the build. It never edits data/providers.json.
// OpenRouter's `/api/v1/models` is an unauthenticated JSON catalog whose `:free`
// variants rotate roughly weekly; diffing it over time is the single best
// automatable signal for "a model just became free somewhere" — and, by
// publisher, "a lab whose models are free that we don't yet list as a
// first-party free provider" (a lead to go check that lab's own docs).
//
//   node scripts/discover.mjs           # report against the stored snapshot
//   node scripts/discover.mjs --write   # also update data/discover-snapshot.json
//   node scripts/discover.mjs --json    # machine-readable report on stdout
//
// Nothing here is authoritative: every lead it prints is still run through the
// inclusion criteria and cited to the PROVIDER'S OWN docs before anything is
// added. See docs/sources.md.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PROVIDERS = new URL('../data/providers.json', import.meta.url);
const SNAPSHOT = new URL('../data/discover-snapshot.json', import.meta.url);
const OPENROUTER = 'https://openrouter.ai/api/v1/models';
const TIMEOUT = 20000;

// Publishers whose free models on OpenRouter we already understand — either we
// list them as a first-party free provider, or they are only ever reachable via
// an aggregator (no direct free API to add). Keeps the "uncovered" list signal-
// rich. Extend as leads get triaged.
const KNOWN_PUBLISHERS = new Set([
  'openrouter', 'google', 'mistralai', 'mistral', 'meta-llama', 'meta',
  'microsoft', 'nvidia', 'qwen', 'alibaba', 'deepseek', 'moonshotai',
  'z-ai', 'zai', 'nousresearch', 'openai', 'cohere', 'ai21', 'minimax',
  'tencent', 'baidu', 'bytedance', 'stepfun', 'sarvamai',
]);

async function getJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const publisherOf = (id) => (id.includes('/') ? id.slice(0, id.indexOf('/')) : id);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function loadSnapshot() {
  if (!existsSync(SNAPSHOT)) return null;
  try {
    return JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const asJson = args.includes('--json');

  const cat = await getJson(OPENROUTER);
  const freeIds = [...new Set((cat.data || [])
    .map((m) => m.id)
    .filter((id) => typeof id === 'string' && id.endsWith(':free')))].sort();

  if (!freeIds.length) {
    console.error('✗ OpenRouter returned no :free models — aborting (transient?).');
    process.exit(1);
  }

  const publishers = [...new Set(freeIds.map(publisherOf))].sort();

  // Cross-reference publishers against our first-party providers (loose name
  // match) plus the KNOWN set, so "uncovered" reads as genuine research leads.
  const data = JSON.parse(readFileSync(PROVIDERS, 'utf8'));
  const providerKeys = new Set();
  for (const p of data.providers) {
    providerKeys.add(norm(p.slug));
    providerKeys.add(norm(p.name));
  }
  const covered = (pub) => {
    const n = norm(pub);
    if (KNOWN_PUBLISHERS.has(pub) || KNOWN_PUBLISHERS.has(n)) return true;
    for (const k of providerKeys) if (k && (k.includes(n) || n.includes(k))) return true;
    return false;
  };
  const uncoveredPublishers = publishers.filter((p) => !covered(p));

  const snap = loadSnapshot();
  const prevIds = new Set(snap?.free_model_ids || []);
  const prevPubs = new Set(snap?.publishers || []);
  const newModels = snap ? freeIds.filter((id) => !prevIds.has(id)) : [];
  const goneModels = snap ? (snap.free_model_ids || []).filter((id) => !freeIds.includes(id)) : [];
  const newPublishers = snap ? publishers.filter((p) => !prevPubs.has(p)) : [];

  const report = {
    source: OPENROUTER,
    free_model_count: freeIds.length,
    publisher_count: publishers.length,
    baseline: !snap,
    new_models: newModels,
    gone_models: goneModels,
    new_publishers: newPublishers,
    uncovered_publishers: uncoveredPublishers,
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`OpenRouter :free catalog — ${freeIds.length} free models across ${publishers.length} publishers.`);
    if (!snap) {
      console.log('• No prior snapshot — establishing a baseline. Run again later to see the diff.');
    } else {
      console.log(`• New free models since last snapshot: ${newModels.length}${newModels.length ? ' — ' + newModels.join(', ') : ''}`);
      console.log(`• Free models that disappeared: ${goneModels.length}${goneModels.length ? ' — ' + goneModels.join(', ') : ''}`);
      console.log(`• New publishers in the free catalog: ${newPublishers.length}${newPublishers.length ? ' — ' + newPublishers.join(', ') : ''}`);
    }
    if (uncoveredPublishers.length) {
      console.log(`\n⇒ Publishers with free models on OpenRouter we don't list as a first-party free provider (leads — check each lab's OWN docs for a direct free tier):`);
      for (const p of uncoveredPublishers) console.log(`    - ${p}`);
    } else {
      console.log('\n⇒ No uncovered publishers — every free-catalog publisher maps to a known provider.');
    }
    console.log('\nNothing was written to data/providers.json. Triage leads via docs/sources.md → inclusion criteria.');
  }

  if (write) {
    const out = {
      note: 'Snapshot of OpenRouter :free model IDs and publishers, written by scripts/discover.mjs. Used only to diff what is NEW between runs; not part of the build. Safe to delete (re-baselines on next run).',
      generated: new Date().toISOString().slice(0, 10),
      free_model_count: freeIds.length,
      publishers,
      free_model_ids: freeIds,
    };
    writeFileSync(SNAPSHOT, JSON.stringify(out, null, 2) + '\n');
    console.log(`\n→ wrote data/discover-snapshot.json (${freeIds.length} ids, ${publishers.length} publishers).`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
