// /api/v1/status.json: one freshness record per provider, keyed by slug (lib/status.mjs). The file validates against
// data/status.schema.json, the schema is published as it is, the values follow the data and the SLA of lib/rules.mjs,
// and every field of the schema is documented in docs/api.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { privateTree } from './lib/private-tree.mjs';
import { datasetAsOf } from './lib/release-stamp.mjs';
import { SLA_DAYS, DUE_SOON_DAYS } from './lib/rules.mjs';
import { freeNow, freshnessAt, lastChangeBySlug, oldestFieldCheck, statusPayload, STATUS_SCHEMA_VERSION } from './lib/status.mjs';

// The build runs in a private copy of the tree: `node --test` runs test files in parallel and two builds would race.
const ROOT = privateTree(join(dirname(fileURLToPath(import.meta.url)), '..'));
const DATA = () => JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const SCHEMA = () => JSON.parse(readFileSync(join(ROOT, 'data/status.schema.json'), 'utf8'));

let built;
const statusApi = () => {
  if (!built) {
    execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'pipe' });
    built = JSON.parse(readFileSync(join(ROOT, 'site/api/v1/status.json'), 'utf8'));
  }
  return structuredClone(built);
};
const compile = () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, validateFormats: true });
  addFormats(ajv, ['date', 'uri']);
  return ajv.compile(SCHEMA());
};

test('oldestFieldCheck returns the earliest checked day, or null without field checks', () => {
  assert.equal(oldestFieldCheck({}), null);
  assert.equal(oldestFieldCheck({ field_checks: {} }), null);
  assert.equal(oldestFieldCheck({ field_checks: { card_required: { checked: '2026-11-24' }, phone_required: { checked: '2026-10-02' } } }), '2026-10-02');
});

test('freshnessAt grades by the SLA at the as-of day, and an unverified entry is unverified', () => {
  const asOf = '2026-11-26';
  const at = (daysAgo) => new Date(Date.parse(asOf + 'T00:00:00Z') - daysAgo * 86400000).toISOString().slice(0, 10);
  assert.equal(freshnessAt({ verified: true, last_verified: at(DUE_SOON_DAYS) }, asOf), 'fresh');
  assert.equal(freshnessAt({ verified: true, last_verified: at(DUE_SOON_DAYS + 1) }, asOf), 'due');
  assert.equal(freshnessAt({ verified: true, last_verified: at(SLA_DAYS) }, asOf), 'due');
  assert.equal(freshnessAt({ verified: true, last_verified: at(SLA_DAYS + 1) }, asOf), 'stale');
  assert.equal(freshnessAt({ verified: false, last_verified: at(1) }, asOf), 'unverified');
  assert.equal(freshnessAt({ verified: true, last_verified: null }, asOf), 'unverified');
});

test('freeNow is false when the probe reported the tier gone, null when unverified, true otherwise', () => {
  assert.equal(freeNow({ verified: true }), true);
  assert.equal(freeNow({ verified: true, probe_status: 'live' }), true);
  assert.equal(freeNow({ verified: true, probe_status: 'tier-ended' }), false);
  assert.equal(freeNow({ verified: false }), null);
});

test('lastChangeBySlug keeps the newest date per slug', () => {
  const m = lastChangeBySlug([
    { slug: 'a', date: '2026-10-01' }, { slug: 'a', date: '2026-11-03' }, { slug: 'a', date: '2026-09-01' }, { slug: 'b', date: '2026-08-08' },
  ]);
  assert.deepEqual(Object.fromEntries(m), { a: '2026-11-03', b: '2026-08-08' });
});

test('statusPayload is keyed by slug in slug order and does not depend on the input order', () => {
  const providers = [
    { slug: 'zeta', verified: true, last_verified: '2026-11-20' },
    { slug: 'alpha', verified: false, last_verified: null },
  ];
  const args = { base: { dataset: 'free-llm-api-hub' }, asOf: '2026-11-26', changes: [{ slug: 'zeta', date: '2026-11-21' }], schemaUrl: 'https://example.test/s.json' };
  const a = statusPayload({ ...args, providers });
  const b = statusPayload({ ...args, providers: [...providers].reverse() });
  assert.deepEqual(Object.keys(a.providers), ['alpha', 'zeta']);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(a.providers.zeta, { last_verified: '2026-11-20', oldest_field_check: null, freshness: 'fresh', free_now: true, last_change: '2026-11-21' });
  assert.deepEqual(a.providers.alpha, { last_verified: null, oldest_field_check: null, freshness: 'unverified', free_now: null, last_change: null });
});

test('status.json validates against its schema, and a deliberately broken copy fails', () => {
  const status = statusApi();
  const validate = compile();
  assert.equal(validate(status), true, JSON.stringify(validate.errors));
  const slug = Object.keys(status.providers)[0];
  const broken = (mutate) => { const c = structuredClone(status); mutate(c); return validate(c); };
  assert.equal(broken((c) => { delete c.providers[slug].freshness; }), false, 'an entry without freshness fails');
  assert.equal(broken((c) => { c.providers[slug].freshness = 'old'; }), false, 'an unknown freshness state fails');
  assert.equal(broken((c) => { c.providers[slug].free_now = 'yes'; }), false, 'a non-boolean free_now fails');
  assert.equal(broken((c) => { c.providers[slug].last_verified = '26/11/2026'; }), false, 'a non-ISO date fails');
  assert.equal(broken((c) => { c.providers.Not_A_Slug = c.providers[slug]; }), false, 'a key that is not a slug fails');
  assert.equal(broken((c) => { c.schema_version = 2; }), false, 'another schema_version fails');
  assert.equal(broken((c) => { delete c.generated_at; }), false, 'a file without generated_at fails');
  assert.equal(broken((c) => { c.providers[slug].added_in_a_later_minor = 1; c.later = true; }), true, 'a field added within v1 does not break a v1 reader');
});

test('status.json covers every provider with values taken from the data, graded at the dataset day', () => {
  const status = statusApi();
  const data = DATA();
  const asOf = datasetAsOf(data);
  assert.equal(status.generated_at, asOf);
  assert.equal(status.generated, asOf);
  assert.equal(status.version, data.version);
  assert.equal(status.schema_version, STATUS_SCHEMA_VERSION);
  assert.deepEqual(status.sla, { due_after_days: DUE_SOON_DAYS, stale_after_days: SLA_DAYS });
  assert.equal(status.count, data.providers.length);
  assert.deepEqual(Object.keys(status.providers), data.providers.map((p) => p.slug).sort());
  for (const p of data.providers) {
    const s = status.providers[p.slug];
    assert.equal(s.last_verified, p.last_verified || null, `${p.slug}: last_verified`);
    assert.equal(s.oldest_field_check, oldestFieldCheck(p), `${p.slug}: oldest_field_check`);
    assert.equal(s.freshness, freshnessAt(p, asOf), `${p.slug}: freshness`);
    assert.equal(s.free_now, freeNow(p), `${p.slug}: free_now`);
  }
});

test('status.json and its schema are listed in index.json, and the published schema is the source file', () => {
  const status = statusApi();
  assert.equal(status.schema, SCHEMA().$id);
  assert.equal(status.schema, 'https://freellmapihub.com/api/v1/status.schema.json');
  assert.equal(readFileSync(join(ROOT, 'site/api/v1/status.schema.json'), 'utf8'), readFileSync(join(ROOT, 'data/status.schema.json'), 'utf8'));
  const index = JSON.parse(readFileSync(join(ROOT, 'site/api/v1/index.json'), 'utf8'));
  assert.equal(index.endpoints.status, 'v1/status.json');
  assert.equal(index.endpoints['status-schema'], 'v1/status.schema.json');
  assert.match(readFileSync(join(ROOT, 'site/api/index.html'), 'utf8'), /\/api\/v1\/status\.json/);
  assert.match(readFileSync(join(ROOT, 'site/llms.txt'), 'utf8'), /\/api\/v1\/status\.json/);
});

test('every field of the status schema is mentioned in docs/api.md', () => {
  const names = new Set();
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        if (k === 'properties' && v && typeof v === 'object') Object.keys(v).forEach((n) => names.add(n));
        walk(v);
      }
    }
  };
  walk(SCHEMA());
  assert.ok(names.size > 15, 'the walk found the fields');
  const doc = readFileSync(join(ROOT, 'docs/api.md'), 'utf8');
  const missing = [...names].filter((n) => !doc.includes('`' + n + '`'));
  assert.deepEqual(missing, [], 'fields of the schema missing in docs/api.md');
});
