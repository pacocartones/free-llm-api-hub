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

## Fields

| Field | Type | Meaning |
|---|---|---|
| `slug` | string | Stable, unique, kebab-case identifier. Never renamed or reused — safe to reference externally. |
| `name` | string | Human-readable provider name. |
| `category` | `ongoing` \| `trial` | Primary bucket. Splits the README and the explorer. |
| `free_type` | enum | Finer shape of the free access (see below). |
| `free_tier` | string | What you actually get for free, in concrete terms. |
| `rate_limits` | string | Published limits — RPM/RPD/TPM/TPD, or an explicit "not published publicly." |
| `notes` | string | **The catch.** The fine print a builder needs before relying on it. |
| `best_for` | string \| null | Editorial one-liner: when this is the right pick. Optional. |
| `modalities` | string[] | Modalities reachable on the free tier: `text`, `vision`, `image`, `audio`, `embeddings`, `rerank`. |
| `expires` | string \| null | Validity window for time-limited offers, e.g. `"30 days"`. `null` for perpetual/renewing tiers. |
| `docs_url` | string | Primary source — the provider's own pricing/rate-limit page. Empty only for ⚠️ unverified entries. |
| `phone_required` | tri-state | Does signup require phone verification? |
| `card_required` | tri-state | Is a payment method required to use the free access? |
| `commercial_ok` | tri-state | Is production/commercial use permitted on the free tier? |
| `openai_compatible` | tri-state | Does it expose an OpenAI-compatible endpoint (drop-in `base_url`)? |
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
