# Comparison dimensions

Every field in [`data/providers.json`](../data/providers.json), defined. The dataset is validated against [`data/schema.json`](../data/schema.json) on every change.

## Tri-state convention

`phone_required`, `card_required`, `commercial_ok` and `openai_compatible` are **tri-state**:

| Value | Meaning |
|---|---|
| `true` | Confirmed yes |
| `false` | Confirmed no |
| `null` | Not yet confirmed — **not** the same as "no" |

Filters treat `null` conservatively: "No card required" matches only `card_required: false`, never `null`.

Three consequences the rest of the project has to honour, or the tri-state is decorative:

- **Both confirmed states get a pill.** Every surface that renders a flag — the README tables, the collection tables, the explorer, the provider pages — shows a badge for `true` *and* for `false`. Absence of a pill therefore means `null` and nothing else. A confirmed card wall must never render the same as an unknown one.
- **`null` never scores as `false`.** In the "Recommended" ranking ([`scripts/lib/rules.mjs`](../scripts/lib/rules.mjs)) a confirmed `false` earns points, a confirmed `true` loses the same points, and `null` scores zero — it sits *between* the two, because that is what not knowing is worth.
- **A `null` is a task, not a verdict.** Resolving one against a primary source is the highest-value contribution to this dataset. Current gaps: `phone_required` 41/68, `commercial_ok` 34/68, `card_required` 7/68.

## Fields

| Field | Type | Meaning |
|---|---|---|
| `slug` | string | Stable, unique, kebab-case identifier. Never renamed or reused — safe to reference externally. |
| `name` | string | Human-readable provider name. |
| `category` | `ongoing` \| `trial` | Primary bucket. Splits the README and the explorer. Follows `free_type`: `trial-credit` is `trial`, every renewing or perpetual type is `ongoing` (enforced by `validate.mjs`). |
| `free_type` | enum | Finer shape of the free access (see below). |
| `free_tier` | string | What you actually get for free, in concrete terms. |
| `rate_limits` | string | Published limits — RPM/RPD/TPM/TPD, or an explicit "not published publicly." |
| `notes` | string | **The catch.** The fine print a builder needs before relying on it. |
| `best_for` | string \| null | Editorial one-liner: when this is the right pick. Optional. |
| `modalities` | string[] | Modalities reachable on the free tier: `text`, `vision`, `image`, `audio`, `embeddings`, `rerank`, `ocr`. |
| `expires` | string \| null | Validity window for time-limited offers, e.g. `"30 days"`. `null` for perpetual/renewing tiers. |
| `docs_url` | string | Primary source — the provider's own pricing/rate-limit page. Empty only for ⚠️ unverified entries. |
| `phone_required` | tri-state | Does signup require phone verification? |
| `card_required` | tri-state | Is a payment method required to use the free access? |
| `commercial_ok` | tri-state | Is production/commercial use permitted on the free tier? |
| `openai_compatible` | tri-state | Does it expose an OpenAI-compatible endpoint (drop-in `base_url`)? |
| `openai_base_url` | string \| null | The OpenAI-compatible base URL to pass to the SDK, when confirmed against official docs. Placeholders like `{account_id}` mark per-account path segments. `null` until backfilled. |
| `models_free` | string[] \| null | A **sample** of model IDs available on the free tier. Attribute field — sampled and may change; not part of the verified core claim. `null` where not populated. |
| `is_text_llm` | boolean | Does the free offering (free tier or trial credit) give API access to text/chat language models? Explicit on every entry. `false` for OCR, TTS, STT, embeddings-only, image and compute-only services. Makes an entry eligible for the top 10. |
| `model_tier` | integer 0-4 \| null | Quality tier of the best free model with a public rating, derived from `model_tier_source.rating` ([thresholds](methodology.md#model-tier)). `null` = no source; never estimated. Trial-credit offers are not rated. |
| `model_tier_source` | object \| null | The provider's model, the exact LMArena row it maps to, that row's rating, votes and snapshot date. Present iff `model_tier` is. |
| `free_limits` | object \| null | Numeric free limits as the provider publishes them (`requests_per_second/minute/day/month`, `tokens_per_day/month`), with `scope`, `source` (the provider's page) and `checked` (date). `null` when the provider publishes none; numbers are never converted between units. |
| `env_key` | string | Name of the env var holding this provider's API key, used by the [live-testing](live-testing.md) probe. Presence marks a provider as probeable; the value lives only in the secrets store, never in the dataset. |
| `last_probed` | string \| null | Date (YYYY-MM-DD) the API was last called live with a real key. Independent of `verified` (docs-based). |
| `probe_status` | enum \| null | Outcome of the last probe: `live`, `auth-ok`, `auth-failed`, `tier-ended`, `rate-limited`, `error`. `live` earns the "live-tested" badge; `auth-ok` confirms `/models` credentials only. |
| `verified` | boolean | Core facts independently confirmed against the provider's docs on `last_verified`. |
| `last_verified` | string \| null | Date (YYYY-MM-DD) of the last confirmation. `null` iff `verified: false`. |

## `free_type` values

| Value | Meaning | Example |
|---|---|---|
| `perpetual` | Specific models priced at $0 indefinitely. | Z.ai GLM-Flash, SiliconFlow free models |
| `renewing-quota` | A quota that resets on a daily/monthly cycle. | Gemini, Groq, Cloudflare Workers AI |
| `recurring-credit` | A credit balance that tops up each month. | Modal, HuggingFace Inference Providers |
| `trial-credit` | A one-time balance granted on signup. | Baseten, Fireworks, Nebius |

## Attribute fields vs. the verified claim

`verified` attests to the **core facts** (tier, limits, key catch, live source link) — see [methodology.md](methodology.md). The softer attribute fields (`openai_compatible`, `modalities`, `best_for`) are convenience metadata, progressively backfilled, and may be `null` even on a fully verified entry. They are not part of what `verified: true` guarantees.

---

_[← Docs index](README.md) · [Main README](../README.md)_
