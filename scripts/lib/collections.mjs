// Shared collection membership for pages and social images.
export const COLLECTIONS = [
  { slug: 'no-credit-card', ogTitle: 'Free LLM APIs · no credit card', filter: (p) => p.card_required === false },
  { slug: 'no-phone', ogTitle: 'Free LLM APIs · no phone', filter: (p) => p.phone_required === false },
  { slug: 'commercial-use', ogTitle: 'Free LLM APIs · commercial use', filter: (p) => p.commercial_ok === true },
  { slug: 'openai-compatible', ogTitle: 'OpenAI-compatible free APIs', filter: (p) => p.openai_compatible === true },
  { slug: 'always-free', ogTitle: 'Permanently free LLM APIs', filter: (p) => p.free_type === 'perpetual' },
  { slug: 'multimodal', ogTitle: 'Free multimodal AI APIs', filter: (p) => (p.modalities || []).some((m) => m !== 'text') },
  { slug: 'no-training', ogTitle: 'Free APIs · no prompt training', filter: (p) => p.data_policy?.trains_on_prompts === false },
  { slug: 'renewing-free-tier', ogTitle: 'Free LLM APIs · renewing allowance', filter: (p) => p.free_type === 'renewing-quota' || p.free_type === 'recurring-credit' },
  { slug: 'free-signup-credit', ogTitle: 'Free LLM APIs · signup credit', filter: (p) => p.free_type === 'trial-credit' && p.verified },
];

