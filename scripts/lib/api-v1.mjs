// Compatibility projection for fields whose canonical dataset representation
// is wider than the stable /api/v1/ contract.

export const toApiV1Provider = (provider) => provider.commercial_ok === 'conditional'
  ? { ...provider, commercial_ok: null }
  : provider;

export const toApiV1ChangeValue = (field, value) => field === 'commercial_ok' && value === 'conditional'
  ? null
  : value;

/** Project field changes before grouping, then remove values that collapse to no change in v1. */
export const projectApiV1Changes = (changes) => changes
  .map((change) => ({
    ...change,
    from: toApiV1ChangeValue(change.field, change.from),
    to: toApiV1ChangeValue(change.field, change.to),
  }))
  .filter((change) => JSON.stringify(change.from) !== JSON.stringify(change.to));

/** JSON Schema for the provider-list payloads served under /api/v1/. */
export function apiV1ProviderSchema(canonicalSchema) {
  const $defs = structuredClone(canonicalSchema.$defs);
  $defs.provider.properties.commercial_ok = { $ref: '#/$defs/tristate' };
  $defs.provider.allOf = ($defs.provider.allOf || []).filter((rule) => !rule.if?.properties?.commercial_ok);
  delete $defs.commercial_ok_value;
  return {
    $schema: canonicalSchema.$schema,
    $id: 'https://freellmapihub.com/api/v1/schema.json',
    title: 'free-llm-api-hub API v1 provider list',
    description: 'Schema for providers.json and the provider-list slices under /api/v1/.',
    type: 'object',
    required: ['dataset', 'version', 'generated', 'license', 'homepage', 'docs', 'count', 'providers'],
    additionalProperties: false,
    properties: {
      dataset: { const: 'free-llm-api-hub' },
      version: structuredClone(canonicalSchema.properties.version),
      generated: structuredClone(canonicalSchema.properties.generated),
      license: { type: 'string' },
      homepage: { type: 'string', format: 'uri' },
      docs: { type: 'string', format: 'uri' },
      slice: { type: 'string' },
      modality: { type: 'string' },
      count: { type: 'integer', minimum: 0 },
      providers: { type: 'array', items: { $ref: '#/$defs/provider' } },
    },
    $defs,
  };
}
