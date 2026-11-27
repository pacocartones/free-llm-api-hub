// free-limits.mjs — the structured free limits of a record (`free_limits`), by metric.
//
// A data module: no markup, no file access. long-guides.mjs re-exports it for its rankings; stale-claims-data.mjs reads it
// to resolve evidence, so the guard on data/stale-claims.json does not reach the guide renderers.

export const LIMIT_METRICS = [
  { key: 'requests_per_day', label: 'requests per day', head: 'Requests per day' },
  { key: 'requests_per_minute', label: 'requests per minute', head: 'Requests per minute' },
  { key: 'requests_per_second', label: 'requests per second', head: 'Requests per second' },
  { key: 'tokens_per_day', label: 'tokens per day', head: 'Tokens per day' },
  { key: 'tokens_per_minute', label: 'tokens per minute', head: 'Tokens per minute' },
  { key: 'requests_per_month', label: 'requests per month', head: 'Requests per month' },
  { key: 'tokens_per_month', label: 'tokens per month', head: 'Tokens per month' },
];
export const limitOf = (x, key) => (x.free_limits && Number.isFinite(x.free_limits[key]) ? x.free_limits[key] : null);
