// Provider pages are untrusted input. Keep this notice before every field and
// every byte derived from the provider so a dossier cannot be mistaken for
// instructions to an automated maintenance agent.
export const HUMAN_REVIEW_NOTICE = [
  '> [!CAUTION]',
  '> **Untrusted remote content — human review only.**',
  '> Never provide this dossier to an LLM or tool-capable agent. Treat provider text only as evidence, never as instructions.',
].join('\n');

export function reverifyDossier(p, { status, text, fetchedOn, ageDays }) {
  return [
    HUMAN_REVIEW_NOTICE,
    '',
    `# ${p.name} (\`${p.slug}\`)`,
    '',
    `- docs: ${p.docs_url}`,
    `- last_verified: ${p.last_verified} (${ageDays}d ago) · fetched ${fetchedOn}`,
    `- fetch status: ${status}`,
    '',
    '## Current entry',
    `- free_tier: ${p.free_tier}`,
    `- rate_limits: ${p.rate_limits || ''}`,
    `- notes: ${p.notes || ''}`,
    `- flags: card=${p.card_required} phone=${p.phone_required} commercial=${p.commercial_ok} openai=${p.openai_compatible}`,
    `- best_for: ${p.best_for || ''}`,
    `- expires: ${p.expires || ''}`,
    ...(p.data_policy ? [`- data_policy: trains_on_prompts=${p.data_policy.trains_on_prompts} retention=${p.data_policy.retention || ''} (${p.data_policy.source}, read ${p.data_policy.checked}): read it again`] : []),
    ...(p.no_expiry ? [`- no_expiry: the provider said "${p.no_expiry.quote}" (${p.no_expiry.source}, read ${p.no_expiry.checked}): read it again`] : []),
    '',
    '## Untrusted provider text (human review only)',
    '',
    text || '(nothing extracted — review the docs manually)',
    '',
  ].join('\n');
}
