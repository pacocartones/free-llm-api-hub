// Shared collection membership for pages and social images. Collections list verified providers only: their pages
// promise rows checked against each provider's own docs, so an unverified entry stays on its provider page and in the
// explorer but out of every collection.
const verifiedOnly = (filter) => (p) => p.verified === true && filter(p);

export const COLLECTIONS = [
  { slug: 'no-credit-card', ogTitle: 'Free LLM APIs · no credit card', filter: verifiedOnly((p) => p.card_required === false) },
  { slug: 'no-phone', ogTitle: 'Free LLM APIs · no phone', filter: verifiedOnly((p) => p.phone_required === false) },
  { slug: 'anonymous-access', ogTitle: 'Free AI APIs · no account needed', filter: verifiedOnly((p) => p.anonymous_access != null) },
  { slug: 'commercial-use', ogTitle: 'Free LLM APIs · commercial use', filter: verifiedOnly((p) => p.commercial_ok === true) },
  { slug: 'openai-compatible', ogTitle: 'OpenAI-compatible free APIs', filter: verifiedOnly((p) => p.openai_compatible === true) },
  { slug: 'always-free', ogTitle: 'Permanently free LLM APIs', filter: verifiedOnly((p) => p.free_type === 'perpetual') },
  { slug: 'multimodal', ogTitle: 'Free multimodal AI APIs', filter: verifiedOnly((p) => (p.modalities || []).some((m) => m !== 'text')) },
  { slug: 'no-training', ogTitle: 'Free APIs · no prompt training', filter: verifiedOnly((p) => p.data_policy?.trains_on_prompts === false) },
  { slug: 'renewing-free-tier', ogTitle: 'Free LLM APIs · renewing allowance', filter: verifiedOnly((p) => p.free_type === 'renewing-quota' || p.free_type === 'recurring-credit') },
  { slug: 'free-signup-credit', ogTitle: 'Free LLM APIs · signup credit', filter: verifiedOnly((p) => p.free_type === 'trial-credit') },
];

