// home-seo.mjs — the home page's title and description and the counts line of llms.txt, from the data.
//
// "free llm api" is the site's top search query (Search Console, Nov 2026: 639 impressions, 1.3% CTR), so the title
// and the description both start with it (the title as "Free LLM API list", the phrase AI assistants are asked for), then give the dataset month and the counts. The counts are stated one way
// everywhere: N providers, "V of N verified" (or "all N verified"). A bare "84 verified" in a title, next to 85
// providers on the page, read as a contradiction. The build fills every value; nothing here is typed by hand.

/** The counts the home page states, from the providers. */
export function homeCounts(providers) {
  return {
    total: providers.length,
    verified: providers.filter((p) => p.verified === true).length,
    ongoing: providers.filter((p) => p.category === 'ongoing').length,
    trial: providers.filter((p) => p.category === 'trial').length,
  };
}

/** "84 of 85 verified", or "all 85 verified". */
export const verifiedPhrase = ({ total, verified }) => (verified === total ? `all ${total} verified` : `${verified} of ${total} verified`);

/** Titles stay under 60 characters (provider-faq.test.mjs), so they are not cut in results. */
export const HOME_TITLE_MAX = 59;

/**
 * "Free LLM API list (Nov 2026): 85 tiers & credits, 84 verified". The title holds the literal phrase "free LLM API
 * list", the query assistants and searchers type (AEO baseline, 27 Nov 2026), then the dataset month and both counts,
 * so the verified figure never stands alone next to a larger total. With counts too long for the budget, the shorter
 * "Free LLM API list (Nov 2026): 84 of 85 verified".
 */
export const HOME_TITLE_PHRASE = 'Free LLM API list';
export function homeTitle(counts, month) {
  const verified = counts.verified === counts.total ? 'all verified' : `${counts.verified} verified`;
  const full = `${HOME_TITLE_PHRASE} (${month}): ${counts.total} tiers & credits, ${verified}`;
  return full.length <= HOME_TITLE_MAX ? full : `${HOME_TITLE_PHRASE} (${month}): ${verifiedPhrase(counts)}`;
}

/** The meta description (also og:description and twitter:description): the query, the month, the split, the proof.
 * Kept under the 155-character snippet budget (build.test.mjs), with room for three-digit counts. */
export function homeDescription(counts, month) {
  return `Free LLM APIs, ${month}: ${counts.ongoing} ongoing free tiers + ${counts.trial} trial credits, ${verifiedPhrase(counts)}. ` +
    `Limits, card, phone, commercial use: sourced and dated.`;
}

/** The counts of llms.txt: "85 providers (43 ongoing free tiers, 42 trial credits), 84 of 85 verified". */
export function llmsCounts(counts) {
  return `${counts.total} providers (${counts.ongoing} ongoing free tiers, ${counts.trial} trial credits), ${verifiedPhrase(counts)}`;
}
