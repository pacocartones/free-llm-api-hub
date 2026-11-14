# Inception Labs eligibility assessment — issue #604

Checked **2026-11-14 UTC**, against main commit
`46b93b53c1a739a93638f0202a557801ae5634e0`.
Related to [issue #604](https://github.com/pacocartones/free-llm-api-hub/issues/604).
Prepared with OpenAI Codex assistance using public official sources only.

## Decision

**Do not add a provider entry in this review.** Inception does state free access,
but its FAQ describes a one-time signup credit, not a recurring free allowance.
More decisively for the requested stable-access review, the provider announces
that the entire API will stop serving requests after December 28, 2026.

The dataset's [inclusion criteria](inclusion-criteria.md) admit one-time trial
credits in general. A one-time credit alone is therefore not a rejection reason.
This decision applies the request's additional stable-access requirement to an
API with an announced shutdown. Do not describe Inception as having no free
access, or label its signup credit a temporary promotion without evidence.
No provider record, verification timestamp or policy quote record is created.

## Official evidence

Every page below was opened on **2026-11-14 UTC**. Quotes retain the provider's
wording; Markdown emphasis is omitted in quoted sentences.

| Source | Quoted evidence and implication |
| --- | --- |
| [Rate limits](https://docs.inceptionlabs.ai/get-started/rate-limits.md) | The table labels a column “Free Tier”: 1,000 API requests, 1,000,000 input tokens and 100,000 output tokens per minute. These are throughput ceilings, not a replenishing free token balance. |
| [Quick start](https://docs.inceptionlabs.ai/get-started.md) | “Every new account includes 100 million free tokens — no payment details required.” It also says: “Each new user is initially assigned **100 million free tokens** to help get started with the API.” This supports initial free access and no card requirement for that credit. |
| [FAQ](https://docs.inceptionlabs.ai/resources/faq.md) | “Every new account includes a one-time credit of 100 million free tokens. The credit is shared across all models rather than granted per model.” No renewal is stated. |
| [Wind-down notice](https://docs.inceptionlabs.ai/support/wind-down.md) | “The Mercury API is winding down. After this date you will no longer have access to the service or to any data submitted to the platform.” The notice identifies that date as December 28, 2026, and its timeline states: “API requests stop being served, and you lose access to the platform and to any data submitted to it.” |
| [Models and pricing](https://docs.inceptionlabs.ai/get-started/models.md) | “Only input tokens are billed, at **$0.02 per million tokens** (50% off the regular $0.04 price).” This refers to Mercury Decide; zero-priced output is not a completely free model. Other models also list positive input/output prices. Launch discounts do not establish permanent free access. |
| [Terms of Use](https://www.inceptionlabs.ai/docs/terms-of-use) | Effective September 1, 2025. “You will only use the Services for your own internal, personal use, and not on behalf of or for the benefit of any third party, and only in a manner that complies with all laws that apply to you.” Do not assert unrestricted commercial permission. The docs' [terms link](https://docs.inceptionlabs.ai/support/tou.md) redirects here. |
| [Privacy Policy](https://www.inceptionlabs.ai/docs/privacy-policy) | Effective April 4, 2025. Includes “Personal Data contained in prompts, inputs and uploaded content processed by our models.” Its purposes include “Improving the Services, including testing, research, internal analytics and product development, including training and refining our models and analyzing usage patters to improve speed and efficiency.” Retention: “We retain Personal Data about you for as long as necessary to provide you with our Services or to perform our business or commercial purposes for collecting your Personal Data.” The docs' [privacy link](https://docs.inceptionlabs.ai/support/privacy.md) redirects here. This is not a fixed request-retention duration or a no-training promise. |

The documentation [index](https://docs.inceptionlabs.ai/llms.txt) supplied the
current pricing, FAQ, terms, privacy and wind-down links. The guessed marketing
URL `https://www.inceptionlabs.ai/pricing` returned a page-not-found response;
the linked Models documentation above supplies the pricing evidence instead.

## Facts and limits of this assessment

- `free_tier`: documented one-time 100-million-token credit shared across models;
  no documented renewal. Do not infer a dollar equivalent or credit expiry.
- `rate_limits`: the Free Tier column gives the per-minute figures above.
- `card_required`: `false` for the initial credit, per Quick Start.
- `phone_required`: `null`; the pages reviewed do not establish a signup rule.
- `commercial_ok`: `null` in this assessment; the personal/internal-use language
  is restrictive and does not establish API-specific commercial permission.
- Policy: personal data in prompts may be used for model improvement/training
  under the quoted policy. No fixed API request-retention period was confirmed;
  that duration remains `null`. Do not infer deletion at shutdown from loss of
  access. No signup, dashboard inspection or authenticated inference was done.

These are research findings, not a proposed provider JSON object. Unknown values
remain unknown, and existing dataset records are untouched. Reconsider inclusion
only if official sources establish a stable replacement offer; a launch discount
or a throughput column is insufficient for this review.

## Validation

`npm run validate`, `npm run build`, `npm test` (603 tests, 0 failures),
`npm run check` (no generated drift), `npm run links` (354 local links) and
`git diff --check` all passed. The build regenerated the site locally without
changing tracked derived files. Logs, official-source snapshots and a SHA-256
source manifest are retained in `/workspace/artifacts/inception-labs-604/`.
The issue remains open for maintainer review.
