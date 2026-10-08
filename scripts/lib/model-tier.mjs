// model-tier.mjs — how `model_tier` (0-4) is derived from a public preference rating.
//
// Source: LMArena "Arena Leaderboard Dataset" (https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset,
// licence CC-BY-4.0), config `text_style_control`, category `overall`, split `latest`. The rating is an
// Elo-style score from human preference votes with style control (it discounts the effect of answer
// length and formatting). It measures preference, not measured capability.
//
// The thresholds are an editorial choice, declared here and in docs/methodology.md. They are public and
// do not depend on any provider. Changing one changes published tiers, so a change goes through review.
// A row only counts with at least MIN_VOTES votes. Tier 0 means "sourced and below the lowest threshold";
// a missing tier (null) means "no source", scores zero and is never estimated.

export const MODEL_TIER_THRESHOLDS = [[4, 1450], [3, 1400], [2, 1330], [1, 1250]];
export const MODEL_TIER_MIN_VOTES = 1000;
export const MODEL_TIER_ATTRIBUTION = 'Model quality data: LMArena Arena Leaderboard Dataset (CC-BY-4.0)';

/** Tier for a rating; null when the rating is not a finite number. */
export function tierForRating(rating) {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return null;
  for (const [tier, min] of MODEL_TIER_THRESHOLDS) if (rating >= min) return tier;
  return 0;
}
