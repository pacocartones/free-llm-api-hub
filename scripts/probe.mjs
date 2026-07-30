// probe.mjs — LIVE-test each provider by actually calling its API with a real key.
//
// Philosophy: don't just trust the docs — call the free tier and record that it
// answered. Writes `last_probed` + `probe_status` (independent of the docs-based
// `verified`) and refreshes `models_free`. Emits data/probe-report.json.
//
//   node scripts/probe.mjs                 # dry run, report only
//   node scripts/probe.mjs --write         # persist results to the dataset
//   node scripts/probe.mjs --auth-only     # skip inference (near-zero footprint)
//   node scripts/probe.mjs --only=groq,cerebras
//   node scripts/probe.mjs --self-test
//
// TRANSPORT-AGNOSTIC: it reads keys from process.env[env_key]. It does not care
// whether they came from `infisical run` (localhost on the VPS or a remote
// domain), a .env, or a CI secret. A provider is probed ONLY if its key is
// present in the environment — so running with no keys is a safe no-op.
//
// SAFETY: keys are used only in Authorization headers. They are never logged,
// never written to the dataset or the report, never committed. Footprint is one
// /models call + one 1-token inference per provider (skip the latter with
// --auth-only).

import { readFileSync, writeFileSync } from 'node:fs';
import { serialize, roundTripError } from './_serialize.mjs';

const FILE = new URL('../data/providers.json', import.meta.url);
const REPORT = new URL('../data/probe-report.json', import.meta.url);
const TIMEOUT = 25000;
const SAMPLE = 8;
const TODAY = new Date().toISOString().slice(0, 10);

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const AUTH_ONLY = args.includes('--auth-only');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);

// publisher-diverse, deterministic sample (mirrors fetch-models.mjs)
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

async function req(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  const start = Date.now();
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON body */ }
    return { status: res.status, ms: Date.now() - start, headers: res.headers, json };
  } catch (e) {
    return { status: 0, ms: Date.now() - start, headers: null, json: null, error: e.message };
  } finally {
    clearTimeout(t);
  }
}

const RL_HEADERS = [
  'x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests',
  'x-ratelimit-limit-tokens', 'x-ratelimit-remaining-tokens',
  'x-ratelimit-reset-requests', 'retry-after',
];
const pickRateLimit = (headers) => {
  const o = {};
  if (!headers) return o;
  for (const h of RL_HEADERS) { const v = headers.get(h); if (v != null) o[h] = v; }
  return o;
};

// Map an HTTP outcome to a probe_status. 402/insufficient-balance ⇒ the free
// tier looks gone; 401/403 ⇒ our key/wording is wrong; 429 ⇒ alive but throttled.
function classify(status, json) {
  if (status === 200) return 'live';
  if (status === 401 || status === 403) return 'auth-failed';
  if (status === 402) return 'tier-ended';
  if (status === 429) return 'rate-limited';
  const msg = JSON.stringify(json || '').toLowerCase();
  if (/insufficient|no free|quota|balance|payment/.test(msg)) return 'tier-ended';
  return 'error';
}

async function probeOpenAI(p, key) {
  const base = p.openai_base_url.replace(/\/$/, '');
  const auth = { Authorization: `Bearer ${key}` };
  const m = await req(`${base}/models`, { headers: auth });
  const authOk = m.status !== 401 && m.status !== 403;
  const models = (m.json && Array.isArray(m.json.data) ? m.json.data.map((x) => x.id) : []).filter(Boolean);

  if (AUTH_ONLY) {
    return {
      authOk, models, model: null,
      status: authOk ? (m.status === 200 ? 'live' : classify(m.status, m.json)) : 'auth-failed',
      latency_ms: m.ms, tps: null, http: m.status, rate_limit: pickRateLimit(m.headers), inference: false,
    };
  }

  const model = (p.models_free && p.models_free[0]) || models[0] || null;
  const embeddingsFirst = (p.modalities || []).includes('embeddings') && !(p.modalities || []).includes('text');
  let inf;
  if (embeddingsFirst) {
    inf = await req(`${base}/embeddings`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: 'ping' }),
    });
  } else {
    inf = await req(`${base}/chat/completions`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
    });
  }
  const status = classify(inf.status, inf.json);
  let tps = null;
  const ct = inf.json && inf.json.usage && inf.json.usage.completion_tokens;
  if (status === 'live' && ct && inf.ms) tps = +(ct / (inf.ms / 1000)).toFixed(1);

  return { authOk, models, model, status, latency_ms: inf.ms, tps, http: inf.status, rate_limit: pickRateLimit(inf.headers), inference: true };
}

async function main() {
  if (args.includes('--self-test')) {
    const err = roundTripError(readFileSync(FILE, 'utf8'));
    console.log(err ? '✗ ' + err : '✓ serializer round-trips data/providers.json exactly');
    process.exit(err ? 1 : 0);
  }

  const data = JSON.parse(readFileSync(FILE, 'utf8'));
  const targets = data.providers.filter((p) => p.env_key && (!ONLY.length || ONLY.includes(p.slug)));
  const results = [];
  let changed = 0, noKey = 0, noAdapter = 0;

  for (const p of targets) {
    const key = process.env[p.env_key];
    if (!key) { noKey++; results.push({ slug: p.slug, env_key: p.env_key, key_present: false, status: 'skipped-no-key' }); continue; }
    if (!p.openai_base_url) { noAdapter++; results.push({ slug: p.slug, env_key: p.env_key, key_present: true, status: 'no-adapter' }); continue; }

    const r = await probeOpenAI(p, key);
    results.push({
      slug: p.slug, env_key: p.env_key, key_present: true, http: r.http, status: r.status,
      auth_ok: r.authOk, models: r.models.length, model_used: r.model,
      latency_ms: r.latency_ms, tokens_per_sec: r.tps, rate_limit: r.rate_limit, inference: r.inference,
    });
    if (WRITE) {
      p.last_probed = TODAY;
      p.probe_status = r.status;
      if (r.models.length) p.models_free = sample(r.models);
      changed++;
    }
    const rl = Object.keys(r.rate_limit).length ? ` rl:${Object.entries(r.rate_limit).map(([k, v]) => k.replace('x-ratelimit-', '') + '=' + v).join(',')}` : '';
    console.log(`${r.status === 'live' ? '✓' : '·'} ${p.slug.padEnd(22)} ${String(r.status).padEnd(13)} http=${r.http} ${r.latency_ms}ms models=${r.models.length}${r.tps ? ` ${r.tps}tok/s` : ''}${rl}`);
  }

  const report = { probed_at: TODAY, auth_only: AUTH_ONLY, count: results.length, results };
  if (WRITE) {
    const out = serialize(data);
    try { JSON.parse(out); } catch (e) { console.error('✗ refusing to write, invalid JSON:', e.message); process.exit(1); }
    writeFileSync(FILE, out);
    writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
    console.log(`\n→ wrote ${changed} probe result(s) to the dataset + data/probe-report.json. Now: npm run build`);
  } else {
    console.log(`\n${results.filter((r) => r.status === 'live').length} live · ${noKey} no-key · ${noAdapter} no-adapter (of ${results.length}). Re-run with --write to persist.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
