// models-api.mjs — /api/v1/models.json, the free-model matrix: one record per model key (the same groups and the
// same order as the model pages /models/<key>/, lib/model-keys.mjs), with one row per provider that lists the model
// in its free-model sample (`models_free`).
//
// Only recorded data: every value is a field of data/providers.json, projected to the v1 types (commercial_ok
// "conditional" becomes null, as in every v1 provider object). A value nobody recorded is null and is never
// estimated. Limits come from lib/free-limits.mjs: the numbers published for that exact ID, else the provider-wide
// numbers marked as such. Each row says where it comes from (`provenance`): the provider page the sample can be
// checked on and the day the provider entry was last verified. `models_free` is a sample and not part of the
// verified core claim, which the file says in its `caveat`.
//
// Pure and deterministic: build.mjs passes the groups and the site URL; the tests call the same code.

import { sortedEntries, isIndexable, MODEL_SAMPLE_CAVEAT } from './model-pages.mjs';
import { limitsForModel } from './free-limits.mjs';
import { toApiV1Provider } from './api-v1.mjs';

const https = (u) => (typeof u === 'string' && /^https:\/\/\S+$/i.test(u) ? u : null);
const tri = (v) => (v === true || v === false ? v : null);

/** Where a row can be checked: the provider's model catalogue when one is recorded, else its docs. */
export function rowProvenance(p) {
  const catalogue = https(p.models_url);
  const docs = https(p.docs_url);
  return {
    source: catalogue || docs,
    source_kind: catalogue ? 'models_url' : docs ? 'docs_url' : null,
    checked: p.verified === true && /^\d{4}-\d{2}-\d{2}$/.test(String(p.last_verified || '')) ? p.last_verified : null,
  };
}

/** The data policy as recorded, reduced to what a matrix compares, or null when nothing is recorded. */
function dataPolicy(p) {
  const dp = p.data_policy;
  if (!dp || typeof dp !== 'object') return null;
  return {
    trains_on_prompts: tri(dp.trains_on_prompts),
    retention: typeof dp.retention === 'string' ? dp.retention : null,
    source: dp.source ?? null,
    checked: dp.checked ?? null,
  };
}

/** One matrix row: provider `p` listing model `id`. */
export function modelRow({ id, p }) {
  const v1 = toApiV1Provider(p);
  const lim = limitsForModel(p, id);
  return {
    slug: p.slug,
    name: p.name,
    model_id: id,
    verified: p.verified === true,
    last_verified: p.verified === true ? (p.last_verified ?? null) : null,
    category: p.category ?? null,
    free_type: p.free_type ?? null,
    expires: p.expires ?? null,
    card_required: tri(v1.card_required),
    phone_required: tri(v1.phone_required),
    commercial_ok: tri(v1.commercial_ok),
    commercial_ok_condition: typeof p.commercial_ok_condition === 'string' ? p.commercial_ok_condition : null,
    openai_compatible: tri(v1.openai_compatible),
    openai_base_url: https(p.openai_base_url),
    data_policy: dataPolicy(p),
    limits_scope: lim.applies_to,
    free_limits: lim.limits ? { ...lim.limits, scope: lim.scope, source: lim.source, checked: lim.checked } : null,
    provenance: rowProvenance(p),
  };
}

/** The body of /api/v1/models.json (everything after the shared API envelope). */
export function modelsApiBody(groups, { site }) {
  const models = groups.map((g) => {
    const rows = sortedEntries(g).map(modelRow);
    return {
      key: g.key,
      name: g.name,
      page: `${site}/models/${g.key}/`,
      indexable: isIndexable(g),
      provider_count: rows.length,
      providers: rows,
    };
  });
  return {
    schema: `${site}/api/v1/models.schema.json`,
    page: `${site}/models/`,
    caveat: MODEL_SAMPLE_CAVEAT,
    count: models.length,
    pairs: models.reduce((n, m) => n + m.providers.length, 0),
    models,
  };
}
