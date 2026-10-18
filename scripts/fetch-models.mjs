// fetch-models.mjs — refresh `models_free` from providers' own /models endpoints.
//
// This is a MAINTENANCE script (like staleness.mjs), not part of the build.
// Its output is non-deterministic (live model catalogs change), so a human runs
// it, reviews the diff, and commits data/providers.json. The build then
// regenerates everything else deterministically from the committed file.
//
//   node scripts/fetch-models.mjs            # public endpoints only
//   node scripts/fetch-models.mjs --write    # actually write data/providers.json
//   node scripts/fetch-models.mjs --self-test
//
// Key-gated providers are refreshed only when the matching env var is set
// (e.g. GROQ_API_KEY). Without it, that provider is left untouched — never
// blanked. Fetched IDs are real; nothing here is guessed.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { serialize, roundTripError } from './_serialize.mjs';
import { keyHostError } from './lib/key-hosts.mjs';

const FILE = new URL('../data/providers.json', import.meta.url);
const SAMPLE = 8; // cap: models_free is a *sample*, not the full catalog
const TIMEOUT = 20000;

// --- extractors: each returns a de-duped, sorted sample of real model IDs -----

// Deterministic, publisher-diverse sample: round-robin across the vendor
// prefix (before "/") so the sample reads as a representative spread rather
// than an alphabetical clump of one vendor. Final list is sorted.
export const sample = (ids, preferred = []) => {
  const available = new Set(ids.filter(Boolean));
  // Preferences are advisory: only use IDs returned by the current catalog.
  // Deduplicate them, preserve the configured order, and respect the sample cap.
  const out = [...new Set(preferred)].filter((id) => available.has(id)).slice(0, SAMPLE);
  const selected = new Set(out);
  const groups = new Map();
  for (const id of [...new Set(ids.filter(Boolean))].filter((id) => !selected.has(id)).sort()) {
    const pub = id.includes('/') ? id.slice(0, id.indexOf('/')) : id;
    (groups.get(pub) || groups.set(pub, []).get(pub)).push(id);
  }
  const keys = [...groups.keys()].sort();
  for (let i = 0; out.length < SAMPLE && keys.some((k) => groups.get(k).length); i++) {
    const g = groups.get(keys[i % keys.length]);
    if (g.length) out.push(g.shift());
  }
  return out.sort();
};

async function getJson(url, headers) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Model IDs are listed in each provider's own public catalogues. Keep these
// lists short and explicit; sample() ignores IDs absent from the live response.
// NVIDIA: https://build.nvidia.com/models
// ModelScope: https://modelscope.cn/models
export const PREFERRED_MODELS = {
  'nvidia-nim': [
    'meta/llama-3.1-8b-instruct',
    'nvidia/llama-3.1-nemotron-70b-instruct',
    'deepseek-ai/deepseek-r1',
    'mistralai/mistral-7b-instruct-v0.3',
  ],
  modelscope: [
    'Qwen/Qwen2.5-72B-Instruct',
    'deepseek-ai/DeepSeek-R1',
    'deepseek-ai/DeepSeek-V3',
    'Qwen/Qwen2.5-Coder-32B-Instruct',
  ],
};

// A standard OpenAI-shaped /models list that needs no key. The JSON fetcher is
// injectable so tests can exercise selection without making a real network call.
export const openaiPublic = (url, preferred = [], fetchJson = getJson) => async () => {
  const d = await fetchJson(url);
  return sample((d.data || []).map((m) => m.id), preferred);
};

// Public endpoints — no API key required.
const PUBLIC = {
  openrouter: async () => {
    const d = await getJson('https://openrouter.ai/api/v1/models');
    // Keep only genuinely-free models (the :free suffix), a diverse spread.
    return sample(d.data.map((m) => m.id).filter((id) => id.endsWith(':free')));
  },
  pollinations: async () => {
    const d = await getJson('https://text.pollinations.ai/models');
    return sample(d.filter((m) => m.tier === 'anonymous').map((m) => m.name));
  },
  // Free credit / free-inference tiers with public OpenAI-shaped catalogs.
  'nvidia-nim': openaiPublic('https://integrate.api.nvidia.com/v1/models', PREFERRED_MODELS['nvidia-nim']),
  modelscope: openaiPublic('https://api-inference.modelscope.cn/v1/models', PREFERRED_MODELS.modelscope),
  // Typhoon's /models is public and returns a bare array, not the OpenAI
  // {data: [...]} shape — handle both so the extractor survives a shape change.
  typhoon: async () => {
    const d = await getJson('https://api.opentyphoon.ai/v1/models');
    const list = Array.isArray(d) ? d : (d.data || []);
    return sample(list.map((m) => m.id));
  },
  'ollama-cloud': async () => {
    const d = await getJson('https://ollama.com/api/tags');
    return sample((d.models || []).map((m) => m.name));
  },
};

// The canonical registry of providers whose /models endpoint is public. This
// list is deliberately separate from the PUBLIC map: an extractor that quietly
// vanishes (the ollama-cloud incident — an edit replaced its entry and the
// provider went stale for a whole session) or a stale entry otherwise slips
// through silently. The self-test fails if PUBLIC and this registry diverge,
// so adding or removing a public extractor is an explicit, reviewed change.
const PUBLIC_REQUIRED = [
  'openrouter',
  'pollinations',
  'nvidia-nim',
  'modelscope',
  'ollama-cloud',
  'typhoon',
];

// Key-gated providers exposing a standard OpenAI-compatible /models endpoint.
// The base URL is read from the provider's own openai_base_url in the data.
const KEYED = {
  groq: 'GROQ_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  sambanova: 'SAMBANOVA_API_KEY',
  scaleway: 'SCALEWAY_API_KEY',
  'wandb-inference': 'WANDB_API_KEY',
};

async function openaiModels(baseUrl, key) {
  const d = await getJson(`${baseUrl.replace(/\/$/, '')}/models`, {
    Authorization: `Bearer ${key}`,
  });
  return sample((d.data || []).map((m) => m.id));
}

// --- self-test: serializer must round-trip the file byte-for-byte -----------

function selfTest() {
  const err = roundTripError(readFileSync(FILE, 'utf8'));
  if (err) {
    console.error('✗ serializer does not round-trip.\n  ' + err);
    process.exit(1);
  }
  // Extractor-registry guard: every extractor slug must exist in the dataset
  // (a stale extractor silently skips in main), and PUBLIC must exactly match
  // the PUBLIC_REQUIRED registry — a deleted extractor otherwise goes
  // unnoticed until the provider's sample is stale (the ollama-cloud case).
  const { providers } = JSON.parse(readFileSync(FILE, 'utf8'));
  const slugs = new Set(providers.map((p) => p.slug));
  const orphaned = [...Object.keys(PUBLIC), ...Object.keys(KEYED)].filter((s) => !slugs.has(s));
  if (orphaned.length) {
    console.error('✗ extractor slug(s) not in data/providers.json: ' + orphaned.join(', ') + ' — remove the extractor or restore the provider.');
    process.exit(1);
  }
  const registered = Object.keys(PUBLIC).sort();
  const required = [...PUBLIC_REQUIRED].sort();
  if (JSON.stringify(registered) !== JSON.stringify(required)) {
    console.error(`✗ PUBLIC extractors drifted from the registry.
  registered: ${registered.join(', ')}
  required:   ${required.join(', ')}`);
    process.exit(1);
  }
  console.log('✓ serializer round-trips data/providers.json exactly');
  console.log('✓ extractor registry intact (' + Object.keys(PUBLIC).length + ' public, ' + Object.keys(KEYED).length + ' keyed)');
}

// --- main -------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) return selfTest();
  selfTest(); // never write if the serializer can't reproduce the file

  const write = args.includes('--write');
  const data = JSON.parse(readFileSync(FILE, 'utf8'));
  const bySlug = Object.fromEntries(data.providers.map((p) => [p.slug, p]));

  const jobs = [];
  for (const [slug, fn] of Object.entries(PUBLIC)) {
    if (bySlug[slug]) jobs.push({ slug, run: fn, kind: 'public' });
  }
  for (const [slug, envVar] of Object.entries(KEYED)) {
    const p = bySlug[slug];
    if (!p) continue;
    const key = process.env[envVar];
    if (!key) {
      console.log(`- ${slug}: skipped (set ${envVar} to refresh)`);
      continue;
    }
    if (!p.openai_base_url) {
      console.log(`- ${slug}: skipped (no openai_base_url in data)`);
      continue;
    }
    const hostError = keyHostError({ env_key: envVar, openai_base_url: p.openai_base_url });
    if (hostError) {
      console.log(`- ${slug}: skipped (${hostError})`);
      continue;
    }
    jobs.push({ slug, run: () => openaiModels(p.openai_base_url, key), kind: 'keyed' });
  }

  let changed = 0;
  for (const { slug, run } of jobs) {
    try {
      const ids = await run();
      if (!ids.length) {
        console.log(`- ${slug}: endpoint returned no usable IDs, left unchanged`);
        continue;
      }
      const prev = bySlug[slug].models_free;
      const same = Array.isArray(prev) && prev.length === ids.length && prev.every((v, i) => v === ids[i]);
      bySlug[slug].models_free = ids;
      if (same) {
        console.log(`= ${slug}: ${ids.length} models (unchanged)`);
      } else {
        console.log(`✓ ${slug}: ${ids.length} models — ${ids.join(', ')}`);
        changed++;
      }
    } catch (e) {
      console.log(`✗ ${slug}: fetch failed (${e.message}), left unchanged`);
    }
  }

  if (write && changed) {
    data.generated = new Date().toISOString().slice(0, 10);
    writeFileSync(FILE, serialize(data));
    console.log(`\n→ wrote data/providers.json (${changed} provider(s) updated). Now run: npm run build`);
  } else if (changed) {
    console.log(`\n${changed} provider(s) would change. Re-run with --write to apply.`);
  } else {
    console.log('\nNo changes.');
  }
}

// Importing this module in tests must not trigger network requests or mutate data.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
