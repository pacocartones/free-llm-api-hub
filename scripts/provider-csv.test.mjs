import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PROVIDER_CSV_COLUMNS, PROVIDER_CSV_OMITTED, providersCsv } from './lib/provider-csv.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

test('providersCsv: exact scalar header, one row per provider, true/false/unknown kept apart, CSV quoting and Unicode preserved', () => {
  const data = {
    version: '9.9.9',
    generated: '2026-11-03',
    providers: [
      {
        slug: 'alpha', name: 'Alpha, Inc.', category: 'ongoing', free_type: 'perpetual', free_tier: 'Free "basic"\nplan', rate_limits: '10 requests/minute', notes: 'Café - नमस्ते', best_for: null,
        expires: null, docs_url: 'https://alpha.example/docs', models_url: 'https://alpha.example/models', phone_required: true, card_required: false, commercial_ok: null, openai_compatible: true,
        openai_base_url: 'https://alpha.example/v1', models_free: ['alpha-large'], is_text_llm: true, model_tier: 2, model_tier_source: { rating: 1000 },
        free_limits: { requests_per_day: 10 }, no_expiry: null, data_policy: { trains_on_prompts: false }, verified: false, last_verified: null, added: '2026-01-01', last_probed: null, probe_status: null,
      },
      {
        slug: 'beta', name: 'Beta', category: 'trial', free_type: 'trial-credit', free_tier: '$5 credit', rate_limits: 'none published', notes: '', best_for: 'testing',
        expires: '30 days', docs_url: 'https://beta.example/docs', phone_required: false, card_required: true, commercial_ok: true, openai_compatible: false,
        openai_base_url: null, models_free: null, is_text_llm: false, model_tier: null, model_tier_source: null, free_limits: null, no_expiry: { source: 'x' }, data_policy: null,
        verified: true, last_verified: '2026-10-01', added: '2026-02-01', last_probed: '2026-10-02', probe_status: 'live',
      },
    ],
  };
  const rows = parseCsv(providersCsv(data));
  assert.deepEqual(rows[0], PROVIDER_CSV_COLUMNS);
  assert.equal(rows.length, 3);
  const bySlug = Object.fromEntries(rows.slice(1).map((r) => [r[PROVIDER_CSV_COLUMNS.indexOf('slug')], Object.fromEntries(PROVIDER_CSV_COLUMNS.map((c, i) => [c, r[i]]))]));
  assert.deepEqual(Object.keys(bySlug), ['alpha', 'beta']);
  assert.equal(bySlug.alpha.dataset_version, '9.9.9');
  assert.equal(bySlug.alpha.dataset_generated, '2026-11-03');
  assert.equal(bySlug.alpha.name, 'Alpha, Inc.');
  assert.equal(bySlug.alpha.free_tier, 'Free "basic"\nplan');
  assert.equal(bySlug.alpha.notes, 'Café - नमस्ते');
  assert.equal(bySlug.alpha.models_url, 'https://alpha.example/models');
  assert.equal(bySlug.alpha.phone_required, 'true');
  assert.equal(bySlug.alpha.card_required, 'false');
  assert.equal(bySlug.alpha.commercial_ok, '', 'unknown stays empty, never false');
  assert.equal(bySlug.alpha.verified, 'false', 'unverified entries are kept and marked false');
  assert.equal(bySlug.beta.commercial_ok, 'true');
  assert.equal(bySlug.beta.openai_compatible, 'false');
  for (const omitted of PROVIDER_CSV_OMITTED) assert.equal(PROVIDER_CSV_COLUMNS.includes(omitted), false, `${omitted} is documented as omitted`);
});

test('providersCsv neutralizes spreadsheet formula prefixes in string cells, including after leading whitespace', () => {
  const rows = parseCsv(providersCsv({
    version: '9.9.9',
    generated: '2026-11-03',
    providers: [{
      slug: 'formula-prefixes',
      name: '=1+1',
      category: '+cmd',
      free_type: '-cmd',
      free_tier: '@cmd',
      rate_limits: ' =1+1',
      notes: '\t+cmd',
      best_for: '  -cmd',
      expires: '\t @cmd',
      phone_required: true,
      card_required: false,
      commercial_ok: null,
      model_tier: -1,
    }],
  }));
  const provider = Object.fromEntries(PROVIDER_CSV_COLUMNS.map((column, index) => [column, rows[1][index]]));

  assert.equal(provider.name, "'=1+1");
  assert.equal(provider.category, "'+cmd");
  assert.equal(provider.free_type, "'-cmd");
  assert.equal(provider.free_tier, "'@cmd");
  assert.equal(provider.rate_limits, "' =1+1");
  assert.equal(provider.notes, "'\t+cmd");
  assert.equal(provider.best_for, "'  -cmd");
  assert.equal(provider.expires, "'\t @cmd");
  assert.equal(provider.phone_required, 'true');
  assert.equal(provider.card_required, 'false');
  assert.equal(provider.commercial_ok, '');
  assert.equal(provider.model_tier, '-1');
});

test('providersCsv keeps a conditional commercial-use reason in its own scalar column', () => {
  const rows = parseCsv(providersCsv({
    version: '9.9.9',
    generated: '2026-11-14',
    providers: [{
      slug: 'conditional-provider',
      commercial_ok: 'conditional',
      commercial_ok_condition: 'Per-model licence, including "give back" terms.',
    }],
  }));
  const provider = Object.fromEntries(PROVIDER_CSV_COLUMNS.map((column, index) => [column, rows[1][index]]));

  assert.equal(PROVIDER_CSV_COLUMNS.indexOf('commercial_ok_condition'), PROVIDER_CSV_COLUMNS.indexOf('commercial_ok') + 1);
  assert.equal(provider.commercial_ok, 'conditional');
  assert.equal(provider.commercial_ok_condition, 'Per-model licence, including "give back" terms.');
});

test('providersCsv on the real dataset: every public provider appears once, including unverified rows, and env_key is not a column', () => {
  const data = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  const publicProviders = data.providers.map(({ env_key, ...rest }) => rest);
  const rows = parseCsv(providersCsv({ version: data.version, generated: data.generated, providers: publicProviders }));
  assert.deepEqual(rows[0], PROVIDER_CSV_COLUMNS);
  assert.equal(rows.length, publicProviders.length + 1);
  const slugs = rows.slice(1).map((r) => r[PROVIDER_CSV_COLUMNS.indexOf('slug')]);
  assert.deepEqual(slugs, publicProviders.map((p) => p.slug));
  assert.equal(new Set(slugs).size, publicProviders.length, 'one row per slug');
  assert.equal(PROVIDER_CSV_COLUMNS.includes('env_key'), false);
});
