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

const FILE = new URL('../data/providers.json', import.meta.url);
const SAMPLE = 8; // cap: models_free is a *sample*, not the full catalog
const TIMEOUT = 20000;

// Canonical key order — must match data/providers.json exactly.
const ORDER = [
  'slug', 'name', 'category', 'free_type', 'free_tier', 'rate_limits', 'notes',
  'best_for', 'modalities', 'models_free', 'expires', 'docs_url', 'phone_required',
  'card_required', 'commercial_ok', 'openai_compatible', 'openai_base_url',
  'verified', 'last_verified',
];
const TOP = ['$schema', 'version', 'generated', 'source', 'note'];

function serialize(data) {
  const val = (v) =>
    Array.isArray(v) ? `[${v.map((x) => JSON.stringify(x)).join(', ')}]` : JSON.stringify(v);
  const provs = data.providers.map((p) => {
    const inner = ORDER.map((k) => `      ${JSON.stringify(k)}: ${val(p[k])}`).join(',\n');
    return `    {\n${inner}\n    }`;
  });
  const top = TOP.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(data[k])},`);
  return `{\n${top.join('\n')}\n  "providers": [\n${provs.join(',\n')}\n  ]\n}\n`;
}

// --- extractors: each returns a de-duped, sorted sample of real model IDs -----

// Deterministic, publisher-diverse sample: round-robin across the vendor
// prefix (before "/") so the sample reads as a representative spread rather
// than an alphabetical clump of one vendor. Final list is sorted.
const sample = (ids) => {
  const groups = new Map();
  for (const id of [...new Set(ids.filter(Boolean))].sort()) {
    const pub = id.includes('/') ? id.slice(0, id.indexOf('/')) : id;
    (groups.get(pub) || groups.set(pub, []).get(pub)).push(id);
  }
  const keys = [...groups.keys()].sort();
  const out = [];
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

// A standard OpenAI-shaped /models list that needs no key.
const openaiPublic = (url) => async () => {
  const d = await getJson(url);
  return sample((d.data || []).map((m) => m.id));
};

// Public endpoints — no API key required.
const PUBLIC = {
  openrouter: async () => {
    const d = await getJson('https://openrouter.ai/api/v1/models');
    // Keep only genuinely-free models (the :free suffix), a diverse spread.
    return sample(d.data.map((m) => m.id).filter((id) => id.endsWith(':free')));
  },
  'github-models': async () => {
    const d = await getJson('https://models.github.ai/catalog/models');
    // Whole catalog is usable on the free (rate-limited) tier.
    return sample(d.map((m) => m.id));
  },
  pollinations: async () => {
    const d = await getJson('https://text.pollinations.ai/models');
    return sample(d.filter((m) => m.tier === 'anonymous').map((m) => m.name));
  },
  // Free credit / free-inference tiers with public OpenAI-shaped catalogs.
  'nvidia-nim': openaiPublic('https://integrate.api.nvidia.com/v1/models'),
  modelscope: openaiPublic('https://api-inference.modelscope.cn/v1/models'),
  'ollama-cloud': async () => {
    const d = await getJson('https://ollama.com/api/tags');
    return sample((d.models || []).map((m) => m.name));
  },
};

// Key-gated providers exposing a standard OpenAI-compatible /models endpoint.
// The base URL is read from the provider's own openai_base_url in the data.
const KEYED = {
  groq: 'GROQ_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  sambanova: 'SAMBANOVA_API_KEY',
  scaleway: 'SCALEWAY_API_KEY',
};

async function openaiModels(baseUrl, key) {
  const d = await getJson(`${baseUrl.replace(/\/$/, '')}/models`, {
    Authorization: `Bearer ${key}`,
  });
  return sample((d.data || []).map((m) => m.id));
}

// --- self-test: serializer must round-trip the file byte-for-byte -----------

function selfTest() {
  const raw = readFileSync(FILE, 'utf8');
  const out = serialize(JSON.parse(raw));
  if (out !== raw) {
    let i = 0;
    while (i < raw.length && raw[i] === out[i]) i++;
    console.error('✗ serializer does not round-trip. First diff near byte', i);
    console.error('  orig:', JSON.stringify(raw.slice(i, i + 60)));
    console.error('  ours:', JSON.stringify(out.slice(i, i + 60)));
    process.exit(1);
  }
  console.log('✓ serializer round-trips data/providers.json exactly');
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
