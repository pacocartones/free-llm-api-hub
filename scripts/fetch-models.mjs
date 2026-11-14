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

import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serialize, roundTripError } from './_serialize.mjs';
import { keyHostError } from './lib/key-hosts.mjs';
import {
  assertCredentialFree, configuredCredentials, safeModelIds, UnsafeProviderOutputError,
} from './lib/provider-output-safety.mjs';

const FILE = new URL('../data/providers.json', import.meta.url);
const SAMPLE = 8; // cap: models_free is a *sample*, not the full catalog
const TIMEOUT = 20000;

class ProviderFetchError extends Error {}

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
    try {
      const res = await fetch(url, { headers, signal: ctrl.signal });
      if (!res.ok) throw new ProviderFetchError(`HTTP ${res.status}`);
      try {
        return await res.json();
      } catch {
        throw new ProviderFetchError('invalid JSON');
      }
    } catch (error) {
      if (error instanceof ProviderFetchError) throw error;
      if (error && error.name === 'AbortError') throw new ProviderFetchError('request timed out');
      throw new ProviderFetchError('request failed');
    }
  } finally {
    clearTimeout(t);
  }
}

// Model IDs verified in the providers' public API catalogues on 2026-11-14.
// Preferences remain advisory: sample() ignores IDs absent from a live response.
export const PREFERRED_MODELS = {
  'nvidia-nim': [
    'nvidia/nemotron-3-super-120b-a12b',
  ],
  modelscope: [
    'deepseek-ai/DeepSeek-V4-Flash-0731',
    'MiniMax/MiniMax-M3',
    'Qwen/Qwen3.5-397B-A17B',
    'ZhipuAI/GLM-5.2',
  ],
};

// A standard OpenAI-shaped /models list that needs no key. The JSON fetcher is
// injectable so tests can exercise retrieval without making a network request.
export const openaiPublic = (url, fetchJson = getJson) => async () => {
  const d = await fetchJson(url);
  return (d.data || []).map((m) => m.id);
};

// Public endpoints — no API key required.
const PUBLIC = {
  openrouter: async () => {
    const d = await getJson('https://openrouter.ai/api/v1/models');
    // Keep only genuinely-free models (the :free suffix), a diverse spread.
    return d.data.map((m) => m.id).filter((id) => typeof id === 'string' && id.endsWith(':free'));
  },
  pollinations: async () => {
    const d = await getJson('https://text.pollinations.ai/models');
    return d.filter((m) => m.tier === 'anonymous').map((m) => m.name);
  },
  // Free credit / free-inference tiers with public OpenAI-shaped catalogs.
  'nvidia-nim': openaiPublic('https://integrate.api.nvidia.com/v1/models'),
  modelscope: openaiPublic('https://api-inference.modelscope.cn/v1/models'),
  // Typhoon's /models is public and returns a bare array, not the OpenAI
  // {data: [...]} shape — handle both so the extractor survives a shape change.
  typhoon: async () => {
    const d = await getJson('https://api.opentyphoon.ai/v1/models');
    const list = Array.isArray(d) ? d : (d.data || []);
    return list.map((m) => m.id);
  },
  'ollama-cloud': async () => {
    const d = await getJson('https://ollama.com/api/tags');
    return (d.models || []).map((m) => m.name);
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
  return (d.data || []).map((m) => m.id);
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
  const bySlug = Object.fromEntries(providers.map((p) => [p.slug, p]));
  const orphaned = [...Object.keys(PUBLIC), ...Object.keys(KEYED)].filter((s) => !slugs.has(s));
  if (orphaned.length) {
    console.error('✗ extractor slug(s) not in data/providers.json: ' + orphaned.join(', ') + ' — remove the extractor or restore the provider.');
    process.exit(1);
  }
  const keyDrift = Object.entries(KEYED)
    .filter(([slug, envVar]) => bySlug[slug].env_key !== envVar)
    .map(([slug, envVar]) => `${slug}: extractor ${envVar}, dataset ${bySlug[slug].env_key || '(missing)'}`);
  if (keyDrift.length) {
    console.error('✗ keyed extractor env mismatch:\n  ' + keyDrift.join('\n  '));
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
  const credentials = configuredCredentials(data.providers);
  const logCredentialFree = (message) => {
    assertCredentialFree(message, credentials);
    console.log(message);
  };
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
      const safeIds = safeModelIds(await run(), credentials);
      const ids = safeModelIds(sample(safeIds, PREFERRED_MODELS[slug]), credentials);
      if (!ids.length) {
        logCredentialFree(`- ${slug}: endpoint returned no usable IDs, left unchanged`);
        continue;
      }
      const prev = bySlug[slug].models_free;
      const same = Array.isArray(prev) && prev.length === ids.length && prev.every((v, i) => v === ids[i]);
      bySlug[slug].models_free = ids;
      if (same) {
        logCredentialFree(`= ${slug}: ${ids.length} models (unchanged)`);
      } else {
        logCredentialFree(`✓ ${slug}: ${ids.length} models — ${ids.join(', ')}`);
        changed++;
      }
    } catch (e) {
      if (e instanceof UnsafeProviderOutputError) throw e;
      const reason = e instanceof ProviderFetchError ? e.message : 'invalid response';
      logCredentialFree(`✗ ${slug}: fetch failed (${reason}), left unchanged`);
    }
  }

  if (write && changed) {
    data.generated = new Date().toISOString().slice(0, 10);
    const out = serialize(data);
    assertCredentialFree(out, credentials);
    writeFileSync(FILE, out);
    logCredentialFree(`\n→ wrote data/providers.json (${changed} provider(s) updated). Now run: npm run build`);
  } else if (changed) {
    logCredentialFree(`\n${changed} provider(s) would change. Re-run with --write to apply.`);
  } else {
    logCredentialFree('\nNo changes.');
  }
}

// Importing this module in tests must not trigger network requests or mutate data.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
