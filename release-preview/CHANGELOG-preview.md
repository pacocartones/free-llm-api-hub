# CHANGELOG preview — v2.15.0

> Preview, regenerated on 2026-11-27 from all 116 fragments in `changes/unreleased/` on `main` at `00e6cb2` with `npm run changelog:collect` (the same move `release:prepare` makes, without the version bump). `release:prepare` refuses a date after today in UTC, so the real heading is written on 2026-12-04 by `npm run release:prepare -- 2.15.0`. The summary paragraph is a draft for the maintainer; the entries below are exactly what the fragments hold today.
>
> Fragment fixes to make on `main` before the release pull request (found while regenerating; not changed here):
>
> - `add-requesty-kilo-experiential.md` ends with a loose paragraph ("With these additions, 25 of 82 providers …") that breaks the `### Added` list. Fold it into the Experiential Labs entry or drop it.
> - 17 fragments carry no PR number. Their PRs, from `git log`: Amazon Bedrock and OCI (#956), Google Cloud TTS, STT and Vision (#942), Nscale, Lightning AI, Azure Document Intelligence and Reducto (#966), answer-first SEO (#952), API examples (#944), Atom feed (#957), compare answer-first (#955), guides batch 3 (#947), MCP status tools (#940), `/models/` on phones (#964), numeric free limits (#941), provider badges (#954), receipts backfill (#949), receipts guard (#950), re-verification batch 4 (#946), CSP tightening (#945), trial credits re-check (#965).
> - Some entries quote counts from the day they merged ("85 tiers & credits", "69 verified", "#N of 76 scored", "25 of 82 providers"). They are examples, not the release's numbers; the summary above gives 91.

## [2.15.0] — 2026-12-04

Twenty-nine providers join the dataset (62 → 91), among them Amazon Bedrock,
OCI Generative AI, three Google Cloud APIs, Azure Speech and Document
Intelligence, Stability AI and several OpenAI-compatible gateways. All are
verified; Poolside, already listed, becomes `verified: false` until its hosted
free access is confirmed. Every yes/no flag that holds a value now has a
receipt: a new optional `field_checks` object records the provider's own
sentence, or why the flag stays `null` (not stated, needs an account, or two
official pages disagree), and `npm run validate` enforces it. Several flags
seeded without a source are now `null`, so filters that treated them as known
may return fewer rows. Other additive fields in `/api/v1/`: `published_speed`,
`anonymous_access`, `keys_url` and `keys_url_source`, plus a new
`/api/v1/status.json` with freshness per provider. The published API schema now
accepts fields added within v1, so clients that validate against an older copy
of `/api/v1/schema.json` should refresh it. The site moves to the warm "Cálida"
brand and adds "Find my free API", one page per model and model family,
answer-first provider and compare pages, provider badges, an Atom feed,
`/not-free/`, `/embed/`, `/quality/` and long-form guides.

### Added

- Amazon Bedrock: AWS Free Tier credit for new customers ($100 at sign-up plus up to $100 more, up to 6 months), usable on Bedrock's OpenAI-compatible Chat Completions API; a payment method is not required for most new customers.
- OCI Generative AI: Oracle Cloud Free Trial credit ($300 for up to 30 days), usable on Grok, Gemini, Llama, Cohere and gpt-oss models through an OpenAI-compatible endpoint; most users need a phone number and a credit card.
- Azure Speech in Foundry Tools, Free F0 tier (`azure-speech`): a permanent
  monthly allowance of 5 audio hours of real-time speech to text, 0.5 million
  neural text-to-speech characters and 5 audio hours of speech translation.
  F0 allows one concurrent real-time transcription and 20 text-to-speech
  transactions per minute. An Azure account needs a phone number and a
  non-prepaid card for identity verification, which is not charged. Real-time
  audio and text are not stored. `commercial_ok` stays unknown
  (`source_silent`). Checked 2026-11-25, agent-assisted (#755).
- Lemonfox.ai (`lemonfox`): a free first month on the $5/month plan, with 10
  million credits for OpenAI-compatible speech to text (Whisper large-v3), text
  to speech, an LLM chat API (DeepSeek V4 Flash, MiMo V2.5 Pro) and image
  generation. Whether the trial needs a payment method is not public, so
  `card_required` stays unknown (`needs_account`). The homepage says data is
  deleted right after processing. Checked 2026-11-25, agent-assisted (#755).
- Berget AI (`berget-ai`): a one-time €5 starting credit on the Trial plan of a
  Swedish, OpenAI-compatible open-model API. A card is required at sign-up but
  nothing is charged, and continued access needs a plan from €25 a month.
  Berget says it keeps no prompt data and does not train on it. Checked
  2026-11-26, agent-assisted (#903).
- Netlify AI Gateway (`netlify-ai-gateway`): the Free plan's 300 monthly
  Netlify credits can pay for model calls through the gateway at 180 credits
  per $1 of usage (at most about $1.67 a month), with a 90-credit-per-minute
  limit. Keys and base URLs are injected into Netlify Functions, and a
  production deploy is needed first. The gateway does not store prompts or
  outputs. Checked 2026-11-26, agent-assisted (#903).
- Bytez (`bytez`): an ongoing Free plan with $1 in credits refreshed every 4
  weeks, usable on open models up to 7B parameters (one concurrent request) and
  on closed models from OpenAI, Anthropic, Google, Mistral and Cohere at the
  provider's price plus 2% (10 requests per second). Each grant expires 4 weeks
  after it is issued. The chat endpoint is OpenAI-compatible. No terms of
  service or privacy policy are published, so `commercial_ok` and the data
  policy stay unknown. Checked 2026-11-25, agent-assisted
  (#790).
- Liquid AI (`liquid-ai`): a one-time $2 API credit for every new organization
  on Liquid Console, for its own LFM and d1 models, through an
  OpenAI-compatible API. The console calls it a limited-time offer. The terms
  allow use for internal business purposes and to operate applications, and
  let Liquid train on prompts and outputs. Checked 2026-11-25, agent-assisted
  (#790).
- Public AI Inference Utility (`public-ai`): a one-time $2 starter credit for
  every new account on a nonprofit, OpenAI-compatible gateway to public and
  sovereign open models (Apertus, SEA-LION, Olmo, Bielik), at 100 requests per
  minute per key on the Free tier. Checked 2026-11-25, agent-assisted (#790).
- Google Cloud Text-to-Speech (`google-cloud-tts`): a permanent monthly free
  usage limit of 4 million characters each of Standard and WaveNet voices and 1
  million characters each of Chirp 3: HD, Neural2, Polyglot and Studio voices.
  Gemini-TTS has no free usage. The pricing page says billing must be enabled,
  so `card_required` is true (stated). Checked 2026-11-26, agent-assisted.
- Google Cloud Speech-to-Text (`google-cloud-stt`): 60 free minutes of audio a
  month on the V1 API; the V2 API has no free minutes. Checked 2026-11-26,
  agent-assisted.
- Google Cloud Vision API (`google-cloud-vision`): the first 1,000 units a month
  free for each feature, OCR included. Checked 2026-11-26, agent-assisted.
- Inception (`inception`): a one-time grant of 100 million free tokens for
  every new account, shared across the Mercury diffusion LLMs (Mercury 3, 2.5,
  2 and Edit 2), with no payment details. The API is OpenAI-compatible and the
  Free Tier allows 1,000 requests per minute. No official page states an
  expiry. By default the terms let Inception train on API submissions; this
  can be switched off in the account settings. `commercial_ok` stays unknown
  because the terms do not address it. Checked 2026-11-25, agent-assisted
  (#741).
- Aion Labs (`aion-labs`): an ongoing free tier of 15 requests per minute and
  20,000 tokens a day on its roleplay and storytelling models, through an
  OpenAI-compatible API. API keys activate only after verifying a payment
  card, which is never charged. It is an EU provider; its terms allow
  commercial use and say prompts and outputs are not used for training, and
  its privacy policy says they are not stored. Checked 2026-11-25,
  agent-assisted (#741).
- MegaNova AI (`meganova`): an ongoing daily free quota of 50 requests per
  model at Tier 1 (free registration, no card) on selected models, among them
  its Manta Mini and Flash, Mistral Small 3.2, community roleplay fine-tunes,
  Qwen3 embeddings and the BGE reranker. Tier 1 allows 60 requests and 200,000
  tokens per minute, through an OpenAI-compatible API. `commercial_ok` stays
  unknown, recorded as `sources_disagree`: the site terms limit free modules
  to evaluation and interactive use, while the free-quota page mentions
  lightweight production use. Checked 2026-11-25, agent-assisted (#750).
- SEA-LION API (`sea-lion`): AI Singapore's free proof-of-concept API for its
  Southeast Asian-language models (instruct, reasoning, guard and embeddings),
  rate-limited to 10 requests per minute per user, through an
  OpenAI-compatible API. Its FAQ says the free API is not designed for
  production workloads, so `commercial_ok` is `false`. Checked 2026-11-25,
  agent-assisted (#750).
- Nscale: $5 of free credit for every new account on its OpenAI-compatible serverless inference API; a payment card is asked for only to buy more credit, and Nscale says it does not log or train on request or response content.
- Lightning AI Model APIs: up to 40 million free tokens to start (the Free plan lists up to 30 credits) across open and closed models under one OpenAI-compatible key; no credit card to start.
- Azure Document Intelligence (Free F0): 500 pages free every month for OCR, layout and prebuilt document models, 1 analyze transaction per second and the first two pages of each request; an Azure account needs a phone number and a card.
- Reducto: $150 in free usage on the pay-as-you-go Standard plan for its document parsing and extraction APIs.
- PLaMo API (`plamo`): an ongoing Free plan from Preferred Networks at 0 yen
  per token for PLaMo 3.0 / 3.1 Prime and PLaMo 3.0 Fin Beta, with usage and
  rate limits (100 requests per minute per key for the Prime family; Fin Beta
  50 requests per user per 24 hours). The API is mostly compatible with the
  openai library. The terms limit use to residents of Japan and Japanese
  corporations, and on the Free plan prompts and outputs are stored and used
  for training. Checked 2026-11-25, agent-assisted (#816).
- Entrim (`entrim`): a one-time $10 credit for new users of a Slovenian,
  OpenAI-compatible open-model API, claimed after a temporary $1 card
  authorization hold. The credit expires 14 days after it is granted unless
  you top up. Entrim says it does not train on prompts or outputs. Checked
  2026-11-25, agent-assisted (#816).
- Infomaniak AI Services (`infomaniak`): one million free credits to test
  Infomaniak's Swiss-hosted, OpenAI-compatible open-model APIs for one month.
  A payment card must be registered. Infomaniak says queries are neither
  recorded nor used for training, and that apps built on the service can be
  monetised. Checked 2026-11-25, agent-assisted (#816).
- Regolo.ai (`regolo`): a 30-day free trial for new subscribers with access
  to all Core chat models, capped at 1M tokens per day, with no credit card.
  It is an EU provider with an OpenAI-compatible API, and it states that it
  does not retain, log or reuse prompts. The trial can be used once per
  subscriber; `commercial_ok` stays unknown because the terms regulate resale
  per plan and do not name the free plan. Agent-assisted check (#714).
- Google Gemini Enterprise Agent Platform, express mode
  (`google-agent-platform-express`, formerly Vertex AI express mode): a
  90-day free tier with an API key and no billing information, only for
  developers with a @gmail.com account who are new to Google Cloud. It is a
  different product from the Gemini API in AI Studio (`google-gemini`). The
  Gemini 2.5 models have 10 requests/min each and the Gemini 3.x models are
  listed as "Dynamic". The data policy comes from the platform-wide
  zero-data-retention page, which does not say whether it covers
  express-mode free-tier accounts. Agent-assisted check (#714).
- Requesty (`requesty`): a UK AI gateway whose free plan gives the models it
  lists as free at $0 per token, 200 requests a day and 20 a minute per
  organization, with no credit card, through the OpenAI-compatible
  `https://router.requesty.ai/v1`. On the free plan Requesty may train its own
  routing models on requests to models it labels Training Permitted Models,
  whose providers train on them too. Checked 2026-11-26, agent-assisted (#936).
- Kilo Gateway (`kilo-gateway`): the API gateway behind Kilo Code serves its
  `:free` models at no cost, even without an account (200 requests an hour per
  IP address), through the OpenAI-compatible
  `https://ai-gateway.kilo.ai/api/v1`. Kilo warns that its Auto Free router may
  send prompts to providers that log them and use them to improve their
  services. Checked 2026-11-26, agent-assisted (#936).
- Experiential Labs (`experiential-labs`): the Free plan of a US AI gateway
  gives 1M tokens a day shared across GPT-6 Luna, DeepSeek V4.1 Flash and the
  Clef decision endpoint (10 requests a minute), after a refunded $1 card
  verification. Free-plan prompts and outputs go into its Data Licensing
  Program: after de-identification they can be used to train AI models and
  sold to third parties. Checked 2026-11-26, agent-assisted (#936).

With these additions, 25 of 82 providers (30.5%) list no `text` modality, under
the 35% non-text guardrail.
- Stability AI Platform API (`stability-ai`): a one-time grant of 25 free
  credits for a new account created with Google sign-in (1 credit = $0.01,
  about $0.25), enough for 8 Stable Image Core images. The credits work across
  the image generation, editing, upscaling, 3D and Stable Audio services. The
  API allows 150 requests every 10 seconds. The FAQ allows commercial use of
  API outputs. The terms let Stability use inputs and outputs to train its models
  unless you opt out (a toggle in the Platform API account settings). The terms say
  unused service credits expire one year after issuance. Whether the credits
  need a card or a phone is not stated (`source_silent`). Checked 2026-11-25,
  agent-assisted (#805).
- `llms.txt` now opens with the dataset date and provider count and follows the
  llms.txt layout more closely: a "Start here" section (`/find/`, `/best/`,
  `/not-free/`, `/compare/`), the dataset pages (`/api/`, `/quality/`,
  `/embed/`, methodology), the guides, the collections, the credit programs
  and one line per provider with its free type, its limits in one line, its
  page and its Markdown version (#901).
- Every provider page has a Markdown version at `/p/<slug>.md`, built from the
  same record: the "is it free" answer, the limits, the flags with the pages
  read and the date, the quickstart and the links. It names `/p/<slug>` as its
  canonical page and is not listed in `sitemap.xml` (#901).
- A "no account needed" collection (`collections/anonymous-access.md` and
  `/collections/anonymous-access`): providers whose own page says the API can
  be called with no account, each row quoting that sentence and the day it was
  read. It rests on a new optional `anonymous_access` object (`source`,
  `checked`, `quote`, optional `note`), validated like `no_expiry`. First
  entries: AI Horde (shared anonymous key `0000000000`) and OVHcloud AI
  Endpoints, whose note records that the same page also says a key is needed
  in each request (#731, issue #182).
- Copy-paste examples on the [API page](https://freellmapihub.com/api/#examples)
  and in `docs/api.md`, for `providers.json`, `status.json`, `providers.csv`
  and `llms.txt`, in curl, JavaScript (fetch, no dependencies) and Python
  (standard library only): ongoing free tiers with no card, providers that are
  fresh and free now, OpenAI-compatible base URLs, the provider with the
  highest daily request limit for a model, no-card commercial providers from
  the CSV, and every provider's Markdown page from `llms.txt`. Both places are
  generated from `scripts/lib/api-examples.mjs`, and
  `scripts/api-examples.test.mjs` runs every snippet against the built files
  with no network, checking that the languages print the same lines. The API
  page also points to the MCP server in `packages/mcp`, which runs from a
  checkout and is not published on npm.
- Every provider now has an *aura*: a fan of radial bars drawn from its own record at build time. Each colour sector is
  a modality it serves, bars that grow from the centre mean an ongoing free tier and an outer crown only a trial, a
  dashed circle means its docs leave a production flag unsaid, and it fades when the last check is over 30 days old.
  The fan's rotation and bar lengths come from the provider's slug, so each aura is its own. It leads each row of the
  explorer and sits at the top of each provider page with its reading in words; the methodology explains how to read it (#845).
- The verified date is now a *receipt*: a perforated ticket on the provider page ("✓ | Verified 24 Nov 2026 · 7
  sources") and a flat pill in the explorer ("Verified · 24 Nov 2026 · 7 sources"). Both link to the page the entry was
  checked on and show the quoted sentence on hover; "N sources" counts the distinct pages behind the entry. Due and
  stale entries keep their own mark and a dashed border (#845).
- New brand mark: the hub's own aura, in the header, the favicon, the app icons and `assets/logo-*.svg` (#845).
- An Atom feed of provider changes at `/changes.atom`: one entry per ISO week,
  built from the same projected weeks as `api/v1/changes.json`, with tag-URI
  ids that never move and every date taken from the data. Every page, the home
  page and `/changes/` included, advertises it with a
  `<link rel="alternate" type="application/atom+xml">` next to the RSS feed.
  `scripts/changes-feed.test.mjs` checks it against the essentials of RFC 4287.
- `/changes/` opens with an answer-first summary of the latest week with a
  change: how many providers changed, how many ongoing free tiers ended and how
  many providers were added, then the changes provider by provider, with "not
  stated" for an unknown value.
- Every static comparison page (/compare/<a>-vs-<b>/) answers "<A> vs <B> free tier" right under its title, built only
  from the data: what each side gives for free (published limits or the free-tier wording), when to pick which (only
  where both records hold different values: ongoing tier or trial, higher limits in the same unit, card, phone,
  commercial use, training on prompts, OpenAI compatibility), the flags side by side and the day each record was
  verified. A field the dataset leaves null reads "not stated" and never decides the pick.
- Every static comparison page has a four-question FAQ (which free tier, card and phone, commercial use, training on
  prompts), each answer citing the days its sources were read, mirrored word for word as FAQPage JSON-LD.
- Compare pages link the provider's official model catalogue under the free-model sample when one is recorded (#869, issue #705). Thanks @mananbharti.
- Published releases can be mirrored to a Hugging Face dataset and to Kaggle (a new
  version per release) by `mirror-dataset.yml`, with a generated dataset card that links
  back here and explains that `null` means unconfirmed. Each destination is skipped until
  its credentials are configured. GitHub stays the source of truth (#716).
- **`field_checks`: why a tri-state flag holds its value.** A new optional
  object on a provider records, for `phone_required`, `card_required`,
  `commercial_ok` and `openai_compatible`, the official pages read, the day,
  and either the provider's sentence (`stated`) or why the flag stays `null`:
  the pages do not say it (`source_silent`), only an account would tell
  (`needs_account`), or two official pages disagree (`sources_disagree`). A
  flag with no entry has no recorded check, which is never "no". It is
  additive in `/api/v1/` (documented in `docs/api.md`); the CSV does not
  carry it. Provider pages and comparisons show the reason and the day where
  they said "not confirmed", `/coverage/` splits each flag into open tasks
  and nulls resolved without an answer, and the MCP server adds
  `unconfirmed_reasons` and `excluded_unconfirmed_by_reason`. Stated quotes
  are registered in `data/quotes.json` as `field_sentence` entries
  (`npm run quotes:add -- <slug> --field <flag>`) (#719).
- "Find my free API" (`/find/`): six quick questions (what you build, card,
  phone, commercial use, no training on prompts, OpenAI compatibility) and a
  ranked shortlist with each provider's free allowance, published limits,
  flags, a "Get a free key" link when `keys_url` is recorded and a copyable
  Python quickstart. Every answer is one of the explorer's filters and the
  order is its Recommended sort; a requirement that is not confirmed never
  counts as yes and is listed apart. Answers live in the URL hash
  (`/find/#use=chat&card=no`), so results are shareable. Linked from the home
  hero, the Providers menu and the guides hub, listed in the sitemap, measured
  by the Lighthouse gate, and reported as `wizard_complete` only with analytics
  consent. Agent-assisted (#817).
- Product events for the optional Google Analytics, sent only when a visitor
  has allowed the analytics category: clicks to a provider's own pages, copied
  snippet kinds, explorer filters, sorting and searches (cut to 60 characters,
  sent after a pause in typing), comparisons and collections viewed, and data
  file downloads. No parameter carries personal data. Provider pages and static
  comparisons mark their outbound links with `data-provider` and `data-link`.
  The event names and the recommended key events are listed in
  `docs/architecture.md`; the privacy page describes them (#718).
- `keys_url` and `keys_url_source`: the provider's own page where a signed-up user creates an API key, as the provider's docs link it, and the docs page that links it. Provider pages show a "Get a free key ↗" button between the free limits and the quickstart when it is set; a click is an `outbound_provider_click` with `link_type: "keys"` (only with analytics consent). Filled for 16 providers from their official docs (checked 2026-11-25): Google Gemini, Groq, OpenRouter, Cloudflare Workers AI, Cohere, Hugging Face, SiliconFlow, Z.ai, SambaNova, Vercel AI Gateway, ModelScope, Fireworks AI, Alibaba Model Studio, Upstage, Inception and Typhoon. Additive within `/api/v1/`; the CSV columns are unchanged (#810). Agent-assisted.
- A `repo_click` product event for the optional Google Analytics, sent only with analytics consent, when a visitor follows a link to the project's GitHub repository, with where the link sits (`header`, `footer`, `contribute` or `content`). The privacy page mentions it (#810). Agent-assisted.
- The site now shows a first-party GDPR consent banner, and Google Analytics 4
  loads only for the categories a visitor allows. Every page offers "Accept
  all", "Reject all" and "Customize", with two independent categories, both
  off by default: analytics, and advertising & personalised measurement
  (Google signals). The choice is remembered in local storage and reopened
  from "Cookie settings" in the footer. Nothing loads from Google until a
  category is allowed; Consent Mode v2 starts with everything denied and
  grants only what the visitor chose. The privacy page describes the
  processing. Analytics is switched on by the repository variable
  `GA_MEASUREMENT_ID`; without it the site ships no analytics code and no
  cookies (#710).
- Free GPU compute: Paperspace Gradient Notebooks (DigitalOcean) added to
  `data/gpu-compute.json`. DigitalOcean's docs state a free GPU plan for
  Notebooks, with six-hour sessions and one running notebook at a time on the
  free tier; credit amount, expiry and card requirement are not stated. Agent-assisted check (#706, issue #317).
- Three long-form guides that each rank one structured field, in the "how to choose" section of the
  [guides hub](https://freellmapihub.com/guides-and-collections/):
  [Free LLM APIs with the highest rate limits](https://freellmapihub.com/guides/free-llm-api-highest-limits)
  ranks the free text LLMs by their structured `free_limits`, one table per unit (requests per day, per minute and
  per second, tokens per day, per month), never converting one unit into another, and lists every free text LLM
  with no structured figure as "not stated" with its published limits in the provider's words;
  [The strongest free LLM APIs, by Arena rating](https://freellmapihub.com/guides/strongest-free-llm-api) ranks the
  free text LLMs with a rated free model by the public LMArena rating behind `model_tier` (rating, 95% interval,
  votes, tier and snapshot date), names the unrated ones and says the rating measures preference, not capability;
  [Free APIs for open models](https://freellmapihub.com/guides/free-open-source-llm-api) lists the providers whose
  free-model sample names a Qwen, Gemma, DeepSeek, Llama, GPT-OSS or GLM model, with the exact IDs, using the
  model-family pages' own rule and linking each family page. Each has a shortlist table, a FAQ whose `FAQPage`
  JSON-LD is the visible text, a gotchas section and links to the provider pages, a collection, `/compare/`,
  `/find/` and `/not-free/`. Every number, list and pick is computed from `data/providers.json` at build time
  (`scripts/lib/long-guides.mjs`). Agent-assisted.
- IndexNow: after each verified deploy, `pages.yml` sends the URLs whose
  sitemap entry is new or has a new `lastmod` to `api.indexnow.org`, which
  shares them with Bing, Yandex and the other participating engines. The list is
  capped at 100. The key file is served from the site root. The step is best
  effort and can never fail the deploy. See `docs/architecture.md` (#721).
- `llms-full.txt` gives each provider with a recorded `data_policy` a
  "Prompt data policy" line: whether it trains on prompts (yes, no or not
  confirmed, as on `/data-policy/`), its retention, and the source page and
  day. A provider without a `data_policy` gets no line (#807, issue #745). Thanks @AyhamJo7.
- Three long-form guides under `/guides/`:
  [Free alternatives to the OpenAI API](https://freellmapihub.com/guides/openai-api-alternatives) (what to switch
  to for chat, embeddings, speech, vision and OCR, with each provider's `base_url`, published limits and check
  date), [How to choose a free LLM API for production](https://freellmapihub.com/guides/choose-free-llm-api-for-production)
  (a six-point checklist: commercial use, limits, data policy, signup, expiry and freshness, and what a `null` flag
  means) and [Free LLM and AI APIs with no credit card and no phone number](https://freellmapihub.com/guides/free-llm-api-no-credit-card-no-phone)
  (every such provider with its catch). The copy is editorial; every number, limit, flag, date and provider list in
  it is computed from `data/providers.json` and `data/not-free.json` at build time (`scripts/lib/long-guides.mjs`),
  so the pages follow the data. Each has a FAQ (`FAQPage` JSON-LD), its own social image, and is on the Guides &
  Collections hub, in the sitemap and in `llms.txt`; related collections and provider pages link to them.
  Agent-assisted (#808).
- **MCP server 0.2.0 (`packages/mcp`, not published by this change): provider status and "Is it free?".** A
  `get_provider_status` tool reads `/api/v1/status.json` for one provider or all of them (last verified, freshness
  against the 60/90-day SLA, `free_now`, last change). `search_providers` and `get_provider` add a `freshness` field
  when `status.json` is available and comes from the same build. An `is_free` tool answers "Is <provider> API free?"
  with the provider page's own sentence, "not stated" for a null field, and the day each fact's source was read; a
  test keeps its wording identical to the site's. New optional local override `--status` / `FLAH_STATUS`. No existing
  tool name or output field changes.
- One page per open model family at `/free-api/<family>/`, answering "Where can I use Qwen / Gemma / DeepSeek /
  Llama / GPT-OSS / GLM for free via API?": the six families listed by the most verified providers in the
  free-model samples when the pages were added (Qwen 14, Gemma 12, DeepSeek 10, Llama 8, GPT-OSS 8, GLM 8). Each
  page opens with a one-sentence answer that gives the count, the ongoing/trial split and the first three providers
  in the recommended order, then a table of the verified providers whose sample lists a model of the family: the
  exact model IDs (linked to their model page when one exists), the free limits, card, phone, commercial use and the
  last verification date, all from `data/providers.json`, with "Not stated" where a field is null. A short computed
  shortlist (no card and no phone, commercial use allowed, ongoing tier, OpenAI-compatible) follows. An ID that names
  two families belongs to the one it names first (`deepseek-r1-distill-qwen-32b` is DeepSeek). Pages carry a
  canonical URL, a title and description, `WebPage` + `BreadcrumbList` JSON-LD and the model-sample caveat; they are
  in the sitemap and `llms.txt` and linked from `/models/` while two or more verified providers list the family, and
  carry `noindex` otherwise (`scripts/lib/model-families.mjs`). The Lighthouse gate now also measures
  `/free-api/qwen/`. Agent-assisted (#922).
- One page per model, `/models/<model>/`, for every model in the providers'
  free-model samples. Each is titled "Free API for" and the model name. The same model listed under
  different deployment names (`openai/gpt-oss-120b`, `gpt-oss-120b`,
  `@cf/…`, `…:free`) shares one page; a different size, version, date,
  quantisation or base/instruct suffix never does, and any other merge needs a
  reviewed entry in `scripts/lib/model-keys.mjs`. Each page shows the exact ID
  every provider lists, the plan, limits with their source and date, the
  card/phone/commercial flags, a quickstart when the provider is
  OpenAI-compatible, and says that model lists are a sample, not part of the
  verified core claim. Only models listed by two or more verified providers
  are indexed and in the sitemap; the others carry `noindex`. `/models/` and
  the provider pages link to them (#711).
- A [`/not-free/`](https://freellmapihub.com/not-free/) page: the APIs people expect to be free and are not, or
  stopped being free (OpenAI, Anthropic, xAI, Together AI, DeepInfra, Mistral, GitHub Models, Cerebras and the
  other removals). Each entry gives what people expect, what the provider's own page says (with the quote already
  recorded in `docs/sources.md` or `data/quotes.json`), the day it was read, and the closest free alternatives in
  the dataset with a shared modality. It has a FAQ (with `FAQPage` JSON-LD) and is in the sitemap, the footer, the
  guides and the comparisons. The README's "Notably NOT free" section and the page are now generated from one
  file, `data/not-free.json`, so they cannot drift (#787). Agent-assisted.
- A [`/embed/`](https://freellmapihub.com/embed/) page, "Use the data": a snippet generator for the widget (count,
  modality, category) with a live preview, the verified badge and each provider's badge, links to the JSON API,
  `providers.json` and `providers.csv`, and a Cite block (BibTeX and APA generated from `CITATION.cff` at build
  time). First-party script only. Linked from the footer, `/api/` and every provider page ("Embed this provider's
  badge") (#787). Agent-assisted.
- The same "Cite this dataset" block (BibTeX and APA from `CITATION.cff`) is also on
  `/api/` and `/quality/` (#868, issue #801). Thanks @playlikeboy.
- Every provider page answers "Is <Provider> API free?" right under its name, in one or two sentences built only from
  the data: ongoing free tier or one-time trial credit, the published limits (or the free-tier wording), credit card,
  phone verification and commercial use, and the day the record was verified. A field the dataset leaves null reads
  "not stated" (#927).
- Every provider page ends with a six-question FAQ (is it free, limits, credit card, commercial use, training on
  prompts, OpenAI-compatible base URL), each answer citing the day its source was read, mirrored as FAQPage JSON-LD (#927).
- `/embed/` now offers the per-provider badge as HTML as well as Markdown, like
  the "Verified providers" badge. Both snippets follow the provider picker and
  `?p=<slug>`; the provider name is escaped in the HTML `alt` text (#849, issue #828). Thanks @bardrop.
- Provider badge kit: every provider now has a small SVG badge served by the
  site at `/badge/<slug>.svg` (and `/badge/<slug>-dark.svg`), in the Cálida
  colours, that reads "Free tier" or "Trial credit" and the date of our last
  verification, e.g. "Free tier · verified 24 Nov 2026". The text comes from
  the dataset on every build. A generic "Listed on Free LLM API Hub" badge sits
  at `/badge/listed.svg`. The new `/badges/` page gives copy-paste Markdown and
  HTML per provider, linking to `/p/<slug>`, the rules (a badge reflects only
  our verification and is not an endorsement) and how to request a correction.
  Each provider page links to its badge below the FAQ. `/badges/` is in the
  sitemap and llms.txt.
- More published speeds (agent-assisted, official pages read 2026-11-24),
  each the provider's own claim for a model of its free sample: Groq
  `qwen/qwen3.8-27b` ~450 tok/s (preview model, the page writes "~450+");
  SambaNova `gpt-oss-120b` over 700 tok/s per user (launch blog post of
  2025-09-08); Scaleway `gpt-oss-120b` and
  `mistral-small-3.2-24b-instruct-2506` above 100 tok/s (Serverless FAQ,
  given as an order of magnitude). Other providers surveyed publish no
  per-model figure for a free model, only relative claims, or attribute
  the figure to a third party, so they get no entry (#733, issue #606).
- **`published_speed`: the speed a provider publishes, with its words.** A
  new optional list on a provider records a speed figure only when the
  provider publishes it on its own site for a model of its free sample:
  `model`, `metric` (`output_tokens_per_second` or
  `time_to_first_token_ms`), `unit`, `value` exactly as written, the
  `qualifier` its words give (`exact`, `approx`, `at_least`, `up_to`),
  optional `conditions`, `plan_named`, `source`, `checked` and `quote`. The
  validator refuses a source off the provider's site, a figure the quote
  does not carry, a qualifier the quote contradicts, a figure attributed to
  a third party and a model outside `models_free`. Quotes are registered in
  `data/quotes.json` as `speed_quote` entries
  (`npm run quotes:add -- <slug> --speed`). Provider pages show a
  "Published speed" section, comparisons a "Published speed" row, and
  `llms-full.txt` a line; all say these are provider claims, not our
  measurement. Additive in `/api/v1/` (documented in `docs/api.md`); the CSV
  does not carry it (#728, issue #606).
- Published speeds (agent-assisted, official pages read 2026-11-24) for Groq
  (gpt-oss-120b, gpt-oss-20b), Cerebras (gpt-oss-120b, qwen-3.8-27b) and
  Sarvam AI (deepseekv4.1-flash-1017). No page states its figure for the
  free tier, and vendor figures are not comparable, so there is no
  "fastest" collection (#728).
- A public data quality page, [`/quality/`](https://freellmapihub.com/quality/): the verified share, freshness
  (fresh, due and stale, and the last verification by week with the day each week turns due), the four yes/no flags
  as answered, null with a recorded reason or not checked, the coverage of `data_policy`, `free_limits` and
  `models_free`, and the non-text ratio under both definitions (no `text` in `modalities`, and `is_text_llm: false`).
  Every number is computed from `data/providers.json` at build time and dated by the dataset's as-of day; tables
  only, no script. Linked from the footer and the methodology, in the sitemap and in the Lighthouse gate.
  Agent-assisted (#765).
- Structured data names who publishes the site and the dataset: Tweakeo, Inc.
  (the copyright holder in `LICENSE`) as `publisher` and Paco Cartones
  (GitHub `pacocartones`, the author in `CITATION.cff`) as `creator`. The home
  page carries one `@graph` with the `Dataset`, a `WebSite` node, the
  `Organization` and the `Person`, each with a stable `@id`
  (`https://freellmapihub.com/#website`, `#dataset`, `#publisher`,
  `#creator`). Every other page that names the site or the dataset refers to
  the same `@id` with the same publisher and creator. No email address is
  published (#764).
- Provider pages' `WebPage` structured data carries `dateModified`, the
  `last_verified` date shown on the page (#764).
- `sitemap-index.xml` lists `sitemap.xml` and `sitemap-state.xml`, so the
  monthly `/state/YYYY-MM/` reports can be found from one submitted sitemap.
  The post-deploy smoke test checks that it is published. `robots.txt` is
  unchanged (#764).
- A freshness histogram: how many verified entries become due (day 61) and
  pass the 90-day SLA (day 91) in each of the next 16 weeks, with clustered
  weeks marked. It is in the weekly worklist (issue #4) and on the
  [data coverage](https://freellmapihub.com/coverage/#freshness)
  page. Agent-assisted (#766).
- **`/api/v1/status.json`: freshness per provider, keyed by slug.** A small
  generated file for clients that poll the dataset, such as API routers: for
  every provider, `last_verified`, the oldest day among its `field_checks`,
  its state against the 60/90-day freshness SLA (`fresh`, `due`, `stale` or
  `unverified`), whether its free access is in effect (`free_now`) and the
  day of its newest field change. States are graded at `generated_at`, the
  dataset day, and the thresholds are in the file, so a client can regrade.
  Contract v1 with a JSON Schema at `/api/v1/status.schema.json`, listed in
  `index.json`, on `/api/` and in `llms.txt`, and documented in
  `docs/api.md`. Purely additive: no existing file changes shape (#918).
- Five long-form guides organised by what you build, in a new "by what you're building" section of the
  [guides hub](https://freellmapihub.com/guides-and-collections/):
  [Free LLM APIs for coding assistants](https://freellmapihub.com/guides/free-llm-api-for-coding),
  [Free APIs to build a RAG app](https://freellmapihub.com/guides/free-api-for-rag),
  [Free LLM APIs for AI agents](https://freellmapihub.com/guides/free-llm-api-for-ai-agents),
  [Free LLM APIs for a chatbot side project](https://freellmapihub.com/guides/free-chatbot-api) and
  [Free AI APIs for students and learning](https://freellmapihub.com/guides/free-ai-api-for-students). Each has a
  "pick a stack" table, a comparison table, a quickstart filled from the data where the repository has one (chat,
  and for RAG an embeddings-plus-chat script with the picked providers' base URLs and free models), a FAQ whose
  `FAQPage` JSON-LD is the visible text, and links to `/find/` with its answers preset in the hash, the provider
  pages, the collections, `/compare/` and `/not-free/`. The coding guide shows the providers' published output
  speeds and structured rate limits; the agents guide says plainly that the dataset does not record tool calling and
  shows OpenAI compatibility, per-minute limits and commercial use instead; the chatbot guide checks every free text
  LLM against the `/find/` wizard's own card, phone, commercial-use and training rules, with unconfirmed checks
  shown as not confirmed; the students guide adds the no-account providers and the student programs from
  `data/programs.json`. Every number, list and pick is computed from the data at build time
  (`scripts/lib/long-guides.mjs`). Agent-assisted (#898).

### Changed and fixed

- NLP Cloud: `rate_limits` now gives the Free plan's 2 parallel requests
  next to Pay-as-you-go's 10, and says that no per-minute limit is published
  for free access (#685). Thanks @Sumit-sourabh45.
- Modal re-verified: the Starter plan's monthly credit is still not settled
  for commercial use, because the No-Fee Use Limitations its terms refer to
  are not published; `commercial_ok` stays unknown (#688). Thanks @BloosomNet.
- Alibaba Cloud Model Studio re-verified: no official sentence says whether
  the evaluation-only rule for "model trials" covers free-quota API calls, so
  `commercial_ok` stays unknown and the reading is recorded (#690). Thanks
  @BloosomNet.
- Photoroom: `data_policy` recorded. Its privacy policy excludes images
  processed through the API from model improvement, so `trains_on_prompts`
  is `false` for the free API access; no retention period is stated (#698).
  Thanks @BloosomNet.
- IBM watsonx: `data_policy` recorded. IBM states it does not use uploaded
  content or model output to train IBM-developed models; text sent through
  the Prompt Lab or API is not stored unless saved, and prompt information
  for up to 500 prompts is kept 30 days (#692). Thanks @BloosomNet.
- SambaNova re-verified: the Free Tier now lists only gpt-oss-120b and
  gemma-4-31B-it (20 RPM / 20 RPD / 200,000 TPD each); DeepSeek-V3.1 and
  Llama-3.3-70B leave `models_free`, `model_tier` moves from 3 to 2, and the
  Developer Tier limits are corrected. `commercial_ok` becomes `false`: its
  docs say all SambaCloud models are Preview models for evaluation, not
  production (#697). Thanks @BloosomNet.
- Google Gemini: `rate_limits` now gives the published Free-tier limits of
  Gemini Decision 1 on the Decisions API (200 RPM, 50,000 TPM, 10,000 RPD).
  `free_limits` stays absent, because Google publishes no free-tier numbers
  for the Gemini 2.5 models in `models_free`; those are shown only in AI
  Studio (#691). Thanks @BloosomNet.
- Moondream: `free_limits` records the published 2 requests/second of the
  Base Tier, the default for all API keys (10/second once the balance is at
  least $10), cited to the official rate-limits page (#689). Thanks
  @Abhishekkumar071.
- Re-verification batch (agent-assisted, official pages read 2026-11-24) for
  Tencent Hunyuan, Groq, OpenRouter, Cloudflare Workers AI and Cohere (#701).
  The sign-up flags (card, phone or commercial use) that no current official
  page states were then set to `null` with a reason, and the five entries
  moved `last_verified` to 2026-11-24 (#719, see `field_checks` below).
  Other changes:
  - Tencent Hunyuan: the TokenHub package can be claimed once per account
    for each model, and the offer may continue or change after 2026-12-31.
    Real-name verification is now cited to the quick start, and the backup
    API hosts are listed. The terms page was re-read and the no-training
    clause still holds.
  - Groq: `trains_on_prompts` is now `false`. Its Services Agreement §4.2
    bars training on inputs and outputs unless the customer allows it. The
    notes say that qwen/qwen3.8-27b is a Preview model, for evaluation only.
    The Free plan tab of the rate-limits page, read in a browser, shows the
    same limits as the dataset.
  - OpenRouter: two `:free` models that are no longer in the catalog are
    removed from the sample.
  - Cloudflare Workers AI: limits, pricing and data policy re-confirmed.
    `@cf/google/gemma-3-12b-it` and `@cf/meta/llama-3.1-8b-instruct` are
    gone from the model catalog and leave the sample.
    `@cf/google/gemma-4-26b-a4b-it`, a free-access model on the pricing page,
    joins it. `model_tier` moves from 2 to 3 (LMArena snapshot 2026-10-02,
    gemma-4-26b-a4b, 1437.5).
- `robots.txt`: `Google-Extended` may now crawl the HTML pages as well as the
  data files. That token also decides whether Gemini may ground its answers on
  these pages and cite them. Every other AI training crawler still gets the
  data files only. The comments at the top of the file explain the policy, and
  `scripts/robots.test.mjs` checks it (#901).
- The header of `llms-full.txt` reads "Data of <date>", like the rest of the
  site (#901).
- AI Horde: `free_limits` records the published ordinary HTTP submit rate limits
  (2 requests/second and 90 requests/minute per IP on text, chat and image submit
  routes) from the official `Haidra-Org/AI-Horde` `service_limits.md` reference (#722, issue #557). Thanks @Abhishekkumar071.
- `anonymous_access` recorded for two more providers after a survey of all 64
  entries against their own pages on 2026-11-25 (agent-assisted reading):
  Jina AI, whose Reader repository says "Anonymous traffic is the most
  aggressively rate-limited and lands in the lowest-trust pool" (Reader only;
  its Embeddings, Reranker and search APIs need a key), and OCR.space, whose
  API page publishes the shared `helloworld` key in samples that are "ready to
  run without any further edits". Pollinations was checked and does not
  qualify: its docs require a secret key for generation requests and leave
  only model listing open (#737).
- The home title and meta description start with "Free LLM APIs", then the dataset month and the counts, built from
  the data: "Free LLM APIs (Nov 2026): 85 tiers & credits, 84 verified" and "… 43 ongoing free tiers + 42 trial
  credits, 84 of 85 verified …". og:/twitter: copies repeat them. The verified count is no longer stated alone next to
  a larger provider total, and `llms.txt` states it the same way ("84 of 85 verified").
- The answer-first paragraph of every provider page has a stable anchor, `#is-it-free`.
- A provider page's `dateModified` is the newest day one of its facts was read (`last_verified` or a later field
  check, free-limits or data-policy reading), not only `last_verified`.
- The tagline is the owner's choice, "We read the docs. You ship the code.", kept in one constant
  (`scripts/lib/brand.mjs`) that the home title, the README, the home social image, the README banner and the GitHub
  social preview all read (#847).
- Social images in the Cálida palette: warm off-white cards with the hub's mark, the title in Roboto Flex and the
  radial-bar auras. Provider cards show up to three published limits, their own aura and the perforated-ticket receipt
  "Verified · N sources"; collections and guides show their first members' auras. They are rendered with bundled
  fonts only, so every machine draws the same image (#847).
- The README opens with a banner of every provider's aura (light and dark), and its static badges use the Cálida
  colours. The site's own footer badge is now the perforated ticket (#847).
- The home hero takes the owner's tagline, "We read the docs. You ship the code.", aligned left, with its two actions
  (Find my free API, Browse all) and the field of every provider's aura beside it with the key to read it (hidden on
  phones, so the explorer stays in the first viewport). The field is a picture, not links. The tagline's second sentence
  "breathes" once on load when motion is welcome; the blinking cursor is gone (#846).
- Provider pages put the aura and its reading beside the name, the perforated ticket above it, up to three published
  limits as large numbers and the sentence quoted from the provider's page with where and when it was read. Right under
  "What's free" come "Get a free key", a new "Copy base URL" button and a "Compare with…" link, then the quickstart; the
  limits, the requirement cards (behind one summary line) and the score, now one line with a small bar, follow (#846).
- On phones the explorer's sort takes its own row, so Requirements and the modality picker are no longer crushed (#846).
- Generated pages keep a side gutter on phones: the hero's breadcrumb, title and lede no longer touch the screen edge (#846).
- New look, part 1 of the "Fingerprint + Receipts" brand, in its warm "Cálida" palette: a warm off-white (or warm
  near-black) ground instead of terminal green, a toasted-saffron accent, one warm colour per modality (text, vision,
  image, speech, embeddings, rerank, OCR) and Roboto Flex with DM Mono for data. The site opens in the light theme
  unless the system asks for dark; the toggle still remembers the visitor's choice. Every colour keeps WCAG AA contrast
  in both themes (checked in CI), and a page's fonts stay under a 90 KB budget that the Lighthouse gate now enforces (#844).
- `changes.xml` now reads the same projected weeks as `api/v1/changes.json`,
  so RSS, Atom and the API list the same changes, and each item links to the
  monthly report that holds the week instead of a `/changes/` anchor that no
  longer exists.
- Site: Cloudflare Web Analytics is now on for freellmapihub.com. Cloudflare
  injects its cookieless beacon at the edge, so the Content-Security-Policy of
  every page now allows `https://static.cloudflareinsights.com` (script) and
  `https://cloudflareinsights.com` (connect); without them the browser blocked
  it. The privacy page no longer says the site does not use Cloudflare's
  analytics: it describes what Cloudflare Web Analytics collects (aggregated
  page views, referring site, Core Web Vitals, country, browser and device
  type), and that it sets no cookies and stores nothing on the device (#806).
- `/coding-tools/` describes itself to search engines: a CollectionPage whose
  ItemList names every tool page, and a BreadcrumbList (#859, issue #793). Thanks @alvaroalonsoparrondo-a11y.
- `CONTRIBUTORS.md` lists every outside contributor with a merged pull request (36 when it was
  regenerated; it listed 13).
  `npm run contributors` regenerates it from the merged pull requests through `gh`, leaving out
  maintainers and bots and listing no email, and it is now a step of every release (`RELEASING.md`).
  The first-merge thanks comment now suggests two open, unassigned good first issues, of the other
  kind when it can (data or code and docs), and CodeRabbit asks less of first-time contributors:
  scoped test reviews and no automatic replies in its threads. Agent-assisted (#763).
- On the compare pages (`/compare/<a>-vs-<b>/`) the links under a cell — "official catalogue ↗" under the
  free-model sample and "#N in the top 10" under the score — are now underlined, so they no longer rely on
  colour alone. Their colour differed from the text around them by 2.88:1 in the light theme and 1.6:1 in the
  dark one, below the 3:1 that WCAG 1.4.1 asks for; axe reported it as `link-in-text-block` (#951).
- `data_policy` recorded for five more providers from their own pages:
  Hugging Face (Inference Providers stores no user data for training and keeps
  no request bodies; debug logs up to 30 days), W&B Inference (CoreWeave does
  not train on Inference Content; zero data retention by default), Z.ai (no
  training on API User Content unless agreed; API texts not stored), Veryfi
  (submitted documents may train its proprietary, non-generative models;
  business opt-out) and Voicegain (retention 0 seconds to 7 days; training not
  stated, so `trains_on_prompts` stays unknown); agent-assisted reading
  (#708).
- `data_policy` recorded for Cohere from its own policy page (agent-assisted):
  section 2.3 says the inputs and outputs of Trial Users (free trial accounts
  with no payment method on file) are used to improve the performance and
  safety of its AI models, after steps to de-identify them, so
  `trains_on_prompts` is `true` and the clause names the trial plan. Retention
  is stated only for Enterprise Users, so it stays unknown for the free trial.
  With this row every provider listed in issues #442 and #445 has a recorded
  `data_policy` (#729).
- Twelve Labs: `data_policy` recorded from its self-serve Terms of Use, which
  license prompts and other Customer Data for training and improving the
  services, so `trains_on_prompts` is `true`; retention is not stated (#870,
  related to issue #744). Thanks @mananbharti.
- The home page's schema.org `Dataset` block, for Google Dataset Search, is now
  generated by the build from `CITATION.cff` and the data: version, last data
  change, verification date range, the fields a reader filters on, and
  downloads for the API v1 JSON, `providers.json`, the CSV and `llms-full.txt`. A build test
  checks it against Google's required properties and that every download is in
  the build (#717).
- The change history is easier to find: the home page links to /changes/ and
  advertises its RSS feed (`changes.xml`), and /changes/ has a Subscribe button (#717).
- The embeddable widget (`/widget.js`, previewed on `/embed/`) uses the Cálida
  dark palette. The rebrand had left the old crimson accent on the old green
  panel, so the heading and the "see all" link read at 3.3:1 (WCAG AA asks for
  4.5:1). Every text colour is now at least 7.7:1, and
  `scripts/widget.test.mjs` ties the widget's colours to the dark tokens in
  `site/styles.css` (#932).
- The "Recommended" order opens with what most visitors look for: text LLMs with an ongoing free tier and no card
  (Z.ai, Typhoon, Google Gemini, AI Horde, Cloudflare Workers AI, Groq, ...), then the rest by the same flag score,
  with text LLMs before other modalities and the rated model tier as tie-breaks. Gemini moves from 9th to 3rd and
  Groq from 21st to 6th. One order (`recommendedCmp` in `scripts/lib/rules.mjs`) is shared by the home table, the
  explorer, the widget and the guides' "Top pick", which is now shown only when it belongs to the guide's modality.
  Agent-assisted (#786).
- The home's search box and filters are in the first desktop viewport (at 598px instead of 1,175px on a 1440×900
  screen; on a phone at 616px instead of 1,856px): the hero repeats no logo, the title is two lines, the four counter
  tiles are one line of text and "New here? How this list works" is a collapsed section. The freshness counter reads
  "Re-checked within the last N days" instead of "Nd oldest verification · 90-day SLA" (#786).
- The header menu is Providers (all providers and The Best), Models, Compare, Changes, API and Guides; Submit is the
  secondary "Contribute" button next to it (#786).
- The titles of the home, `/best/`, the guides and `/models/` carry the dataset month, e.g. "Free LLM APIs (Nov 2026):
  69 verified free tiers & credits, sourced & dated" (#786).
- Flag values seeded on 2026-07-30 (and Tencent's card flag of 2026-08-14)
  with no recorded source, which no official page states on 2026-11-24
  (agent-assisted reading), are now `null` with their reason: Groq
  `phone_required` and `commercial_ok`; OpenRouter `phone_required`,
  `commercial_ok` and `card_required` (its terms say credits must be
  purchased to make API calls, its FAQ gives new users a free allowance);
  Cloudflare Workers AI `phone_required` and `commercial_ok`; Cohere
  `phone_required`; Tencent Hunyuan `card_required`. Cloudflare's
  `card_required: false` ("Start building for free — no credit card
  required.") and Cohere's `card_required: false` and `commercial_ok: false`
  now carry the provider's sentence (for Cohere, the pricing page's sentence
  that trial keys are not for production or commercial use). Tencent Hunyuan
  `phone_required` becomes `true`: Tencent Cloud's sign-up guide binds a
  mainland China phone number by SMS code. These five entries, re-verified in
  #701, move `last_verified` to 2026-11-24 (#719).
- First recorded reasons for 22 more null flags, all read 2026-11-24
  (agent-assisted reading), among
  them Modal and Alibaba Cloud Model Studio commercial use (not stated),
  Hugging Face phone (needs an account, issue #12) and SambaNova card (pages
  disagree) (#719).
- Site: `/find/` no longer jumps when its script starts. The questions and the
  live count used to appear only after `find.js` ran, pushing the rest of the
  page down (layout shift 0.49 on a phone, performance 0.79 against the 0.80
  budget, the only page under it). They are now in the page from the first
  paint; without JavaScript the form is hidden by CSS and the no-script links
  show as before (#874).
- Google Gemini now records why no card is required for the Free Tier: new accounts begin on it, and a billing account is only set up to reach the Paid Tiers (billing docs, checked 2026-11-25) (#776, issue #758). Thanks @BloosomNet.
- `data_policy` recorded for Gladia from its official data-retention documentation (checked 2026-11-25): Free accounts retain audio input, transcription output, API metadata and logs for 1 year by default (paid accounts keep audio and transcripts 3 weeks; only Enterprise offers custom or zero retention), while `trains_on_prompts` remains `null` because Gladia's Pricing/Security pages and Compliance Hub conflict on default training (#783, related to issue #744). Thanks @Abhishek882772.
- The site serves Google Search Console's ownership file
  (`/googlee1498fc573a3811d.html`), so the maintainer can see search
  coverage and submit the sitemap. It is a static file and sets no cookie (#713).
- The change history counts each real change once. It now follows `main`'s first-parent line instead of every
  commit of every merged branch: with two pull requests open at the same time their commits interleaved, and each
  branch's revision undid the other's edits, so every flip counted as a field change. A merged pull request is now
  one revision, dated the day it landed, and a month-end snapshot is always `main`'s state (#798). The commits of
  one day also merge into one entry per field, with the value before the day's first commit and after its last; a
  field that ended the day where it started is left out, and limits and flag changes show before → after (#789).
  `/state/2026-11/` had reported 362 field changes for November 2026 where `main` had about 170, and `/changes/`,
  `changes.xml`, `api/v1/changes.json`, `api/v1/history.json`, the monthly reports and the provider pages'
  history repeated the same flips (`/p/groq` listed "Updated the catch" ten times on 2026-11-24; it now lists it
  once).
- Home page density: the first desktop screen is back to a few clear choices. The hero
  keeps one primary action, "Find my free API" (to `/find/`), and a quiet "Browse all ↓"
  link to the table; the "Get started" and "Popular" rows and the hero's Star button are
  gone (the GitHub link stays in the header), and the counters sit on one quiet line (#892).
- The explorer has one control bar: a search box, a "Requirements (n)" dropdown that
  groups the boolean filters (no card, no phone, commercial use, no training,
  OpenAI-compatible, text LLMs only, verified only) and the type, the modality menu and
  "Sort by". Active filters show under the bar as removable chips with ✕. The collections
  are plain text links. The filter ids, URL parameters and GA4 events
  (`explorer_filter`, `explorer_sort`, `site_search`) are unchanged (#892).
- A visible "All providers" heading now sits above the table. This supersedes #850;
  thanks to @alvaroalonsoparrondo-a11y for proposing it.
- The table has four columns. The type (Ongoing / Trial) sits next to the provider name,
  and the "Type" column with its flag icons and "The catch" are replaced by a short
  "Needs / unknown" cell that says in words only what a provider requires and which of
  the four production flags are unknown ("Card required", "Unknown: phone, training",
  "Nothing required"). "Not stated" and the ✓ marks are gone from the table. Sorting
  that column orders by fewest requirements. Rows are at most 72 px tall on a desktop
  (they were 82 to 129 px). The server render and the browser repaint still run the same
  function (`scripts/lib/rows.mjs`) (#892).
- Phones: the cookie banner is a compact bar (about 106 px tall at 390 px wide, it was
  319 px) with the same texts, the same three answers and the same consent behaviour;
  the menu panel is opaque and starts with "Find my free API" (#892).
- New `scripts/home-density.test.mjs` holds the budget: two controls in the hero, one
  control bar, no "Not stated", rows of at most 72 px, the banner height, the GA4 hooks
  and server/client row parity (measured in a real browser when Playwright is installed).
  Agent-assisted (#892).
- The home page no longer rebuilds the whole provider table when its script
  loads. It keeps the server-rendered rows and replaces only the cells your
  clock changes (how many days ago a provider was verified, an expired "NEW"
  badge), which removes most of the page's blocking time on a phone. Filters,
  sorting, shared links and the table's keyboard navigation work as before (#754).
- Home page: a short "New here? How this list works" section between the hero
  and the explorer (collapsed since #786) says what the list is, what "verified" means and how to use
  the data, with links to the methodology, the JSON API and the change log. Its
  counts and the oldest and newest verification dates come from
  `data/providers.json` (`scripts/lib/home-first-use.mjs`). It replaces the four
  generic trust cards; on a phone its cards are tighter and drop their icons (#720).
- Home page: `theme-color` has a light value for a light colour scheme, so the
  mobile browser bar matches the page (#720).
- `playground_url` for Jina AI: the Reader page (`https://jina.ai/reader/`), whose built-in demo fetches a URL without signing in (checked 2026-11-25) (#780, related to issue #746). Thanks @duan-n2d.
- "Get a free key" now links the key page each provider's docs name (`keys_url`,
  with that docs page as `keys_url_source`, checked 2026-11-26) for 14 more
  providers: Aion Labs (#836), Bytez (#837), Novita AI (#838), Mixedbread
  (#839), Stability AI (#840), Datalab (#841), Cartesia (#851), Fish Audio
  (#852), Gladia (#853), Moondream Cloud (#854), Speechmatics (#855), Voyage AI
  (#856), ElevenLabs (#857) and Google Gemini Enterprise Agent Platform
  (express mode) (#858). Thanks @alvaroalonsoparrondo-a11y.
- `llms-full.txt` now shows the commercial-use condition for providers marked
  `conditional`, on its own line after `Gates:` (#736, issue #704). Thanks @Lil-Clanky.
- The provider table keeps its table semantics on phones. The card layout
  sets `display: block` on the table, which makes some screen readers
  (VoiceOver on iOS, some Chromium versions) drop the rows, cells and column
  headers; the markup now states `table`, `rowgroup`, `row`, `columnheader`
  and `cell` roles explicitly. The visible card labels are drawn with an empty
  alternative text, so the column name is not read twice (#739).
- The embeddings, speech, OCR and image-generation guides are now long-form guides, at the same URLs:
  [Free embedding APIs](https://freellmapihub.com/guides/free-embeddings-apis),
  [Free speech-to-text and text-to-speech APIs](https://freellmapihub.com/guides/free-speech-to-text-apis),
  [Free OCR and document-parsing APIs](https://freellmapihub.com/guides/free-ocr-document-ai-apis) and
  [Free image generation APIs](https://freellmapihub.com/guides/free-image-generation-apis). Each has who it is
  for, a comparison table (free limits, card and phone, commercial use, data policy, check date), how to choose,
  the gotchas from each entry's notes and the reasons a flag stays unconfirmed, and a FAQ (`FAQPage` JSON-LD). The
  embeddings guide has the repository's embeddings quickstart, filled from the data. The speech guide's
  speech-to-text and text-to-speech labels and the image guide's split between generation and other image APIs are
  read from the words of each entry, and the pages say so. Every number and list is computed from
  `data/providers.json` at build time (`scripts/lib/long-guides.mjs`). Agent-assisted (#820).
- `models_free` samples for six active text-LLM providers that had none,
  each read from the provider's own catalogue on 2026-11-24 and tied to the
  free access recorded in the entry: IBM watsonx (Lite plan), Fireworks AI
  and Baseten (trial credit), Alibaba Cloud Model Studio (models whose
  Singapore free quota is still listed), AI Horde (text models served by
  volunteer workers on that day, which change often) and Tencent Hunyuan
  (TokenHub new-user quota for all language models). Five gain a
  `models_url`. IBM watsonx's `model_tier` moves from unknown to 2, from
  the Arena row of gpt-oss-120b (snapshot 2026-10-02) that SambaNova
  already cites; the trial-credit offers stay unrated, and no AI Horde model
  maps to an exact Arena row. NLP Cloud, Contextual AI, Upstage and Novita stay `null`:
  no official page read ties their free credits to model IDs, or the docs
  were unreachable (#712, issue #455).
- `/models/` no longer breaks words in the middle on a phone: under 560px each row is a card with its column names as
  labels, and on wider screens words wrap only at spaces. The table keeps its column headers (with `scope`), a caption
  and explicit table roles, inside a labelled scroll region you can reach with the keyboard.
- `/models/` opens with an answer line built from the data ("161 models free across 40 providers; most widely
  available: …"), links each model of an open family to its `/free-api/<family>/` page, shows the free type in words,
  and its title and description lead with "Free AI models API".
- ElevenLabs: provider page links the official model catalogue (`models_url`, https://elevenlabs.io/docs/overview/models, checked 2026-11-26; #867). Thanks @alvaroalonsoparrondo-a11y.
- Provider pages link the official model catalogue (`models_url`) of 12 more
  providers, checked 2026-11-25 and 2026-11-26: OpenRouter
  (`https://openrouter.ai/models`; #773, issue #747), Voyage AI (its embeddings
  model list; #822, issue #796), Liquid AI (#833), Public AI (#834), Bytez
  (#835), Cloudflare Workers AI (#860), Cohere (#861), Cerebras (#862),
  SambaNova Cloud (#863), NVIDIA NIM (#864), Deepgram (#865) and AssemblyAI
  (#866). Thanks @BloosomNet (OpenRouter), @AyhamJo7 (Voyage AI) and
  @alvaroalonsoparrondo-a11y (the other ten).
- Contributors: a monthly workflow (`monthly-issues.yml`, `scripts/monthly-issues.mjs`) opens two
  recurring issues on the 1st: "Free tier changes — <Month YYYY>", listing the providers added and
  removed and the limit and flag changes of the month that ended (from the same git history as the
  What changed page) and asking for changes we missed with a source link, and "New provider
  candidates — <Month YYYY>", one proposal per comment under the inclusion criteria with the current
  non-text share against the 35% guardrail. It never opens the same month's issue twice and never
  edits data. `CONTRIBUTING.md` lists where to find work each month. Agent-assisted (#784).
- The `copy_snippet` GA4 event (sent only with analytics consent) recognises the widget snippet, which starts
  with `<div`, as `embed` instead of `other`, and takes two new values, `badge` and `citation`, from the code
  blocks of `/embed/` (#787).
- The widget's "Could not load" fallback line takes the host page's text colour instead of a fixed grey that
  failed contrast on dark pages (#787).
- `/not-free/`: Replicate, GitHub Models and Featherless AI now show the
  sentences from their own pages, the source and the day they were read,
  instead of "Date not recorded": Replicate's prepaid-credit page ("To use
  Replicate, you must first purchase credit upfront.") (#821), GitHub's
  retirement changelog ("As of July 30, 2026, GitHub Models is now retired.")
  (#842) and Featherless AI's billing page (Chat is a flat $25/month
  subscription; Pay-As-You-Go is a prepaid credit balance, and API calls are
  blocked at zero) (#843); issue #803. Thanks @AyhamJo7 (Replicate) and
  @alvaroalonsoparrondo-a11y (GitHub Models, Featherless AI).
- Numeric `free_limits` for four more providers, each read on the provider's
  own limits or pricing page on 2026-11-26 (agent-assisted):
  - Google Gemini (`google-gemini`): 200 RPM and 10,000 RPD on the Free tier,
    for Gemini Decision 1 on the Decisions API only. That is the one Free-tier
    table the page publishes; it says other models' limits are shown in AI
    Studio.
  - Bytez (`bytez`): 10 requests per second on closed models on the Free plan.
  - Photoroom (`photoroom`): 1,000 sandbox calls a month on the Image Editing
    API.
  - Azure Speech (`azure-speech`): 20 requests per minute for F0 real-time
    text to speech, which the page words as "20 transactions per 60 seconds".
- Groq and Cerebras: `field_checks` now record the sentence behind
  `openai_compatible: true`. Groq's OpenAI compatibility page says the API was
  designed to be mostly compatible with OpenAI's client libraries; Cerebras's
  says it is compatible with OpenAI client libraries for many common workflows.
  Both give the same base URL as `openai_base_url`. The flags and the base URLs
  are unchanged (#785, #797, issue #777). Thanks @AyhamJo7.
- Issue forms and the contribution guide follow the maintainers' shared standard: the
  maintainer "Prepared task" form (formerly "Program task") tells contributors to commit only the
  files they edited and never regenerated files; a new "Proposal" form agrees the scope before
  code; the issue chooser links the security policy; and `CONTRIBUTING.md` states a best-effort
  reply goal of 3 business days, a cap of about 30 open good first issues and the new `tracker`
  label, which the monthly issues now carry. A `.contributors.json` profile records these rules (#917).
- On a 390px phone, the 30 compare pages, the coverage page and the Goose coding-tool page no longer scroll the whole page sideways: the compare and coverage tables scroll inside their own labelled region, as the other wide tables do, and a source listed by its full URL wraps (#902).
- **Poolside, now `verified: false`:** Poolside Platform's own page says its
  hosted inference "will shut down on 31 October 2026" and points to
  self-hosting the open weights, while the docs still offer a free Platform
  key. Whether free hosted access still works could not be confirmed (read
  2026-11-24, agent-assisted). It leaves the ranking until confirmed; removal follows only if
  the end is confirmed (#707).
- Commercial use, from official terms read 2026-11-24 (agent-assisted):
  Pollinations becomes `"conditional"` (its terms say "Model licences vary;
  verify before commercial use."), and Contextual AI becomes `true` (its
  terms grant the right to make Customer Applications available to third
  parties, with no evaluation-only clause) (#707).
- `CONTRIBUTING.md` has a section for participants of contribution programs such as Social
  Winter of Code Season 7 (1 January to 30 March 2027): how to pick and `/take` an issue, the
  limit of two open assigned issues, no hoarding, 7-day inactivity during a program, at most two
  Easy merges per person, the three difficulty levels, that a maintainer adds the level label at
  merge and only to pull requests that close a labelled issue, review times, the first-fork
  approval wait, and the AI policy and quote rules. The program's label names appear in one table,
  to update when SWoC publishes them. A maintainer issue form, "Prepared task", writes tasks in the
  good first issue shape (context, task, how to check, done when, files, size) with level guidance.
  The `/take` bot reads its per-person limit from one `MAX_OPEN` setting, says the limit when it
  refuses and links the inactivity rules; `scripts/issue-assign.test.mjs` runs the workflow's shell
  against a local `gh` double and checks the limit matches `CONTRIBUTING.md`. Agent-assisted (#772).
- The home page title is "Free LLM APIs (<month>): <N> verified free tiers & credits", under 60 characters (#927).
- Provider pages put the quickstart snippet right after the free limits, before the speed figures, the data policy
  and the provider's own description: on `/p/groq` it moves from 4,540px to 2,349px down the page on a phone and
  from 2,769px to 1,431px on a desktop. Agent-assisted (#789).
- A provider page suggests comparisons with providers of the same main modality (Groq: SambaNova Cloud, Sarvam AI,
  Scaleway; no longer Jina AI, an embeddings API), with the published compare page when there is one and the
  interactive view otherwise. No compare page is added or removed (#789).
- Provider pages with published numeric limits lead their meta description with them, e.g. "Groq free tier: 30 RPM,
  1,000 RPD, 200K TPD, no card. Verified 24 Nov 2026 with source."; the others cut the free tier at a word (#789).
- The score reads as a place ("#N of M scored") with a bar of its six inputs, unknowns in grey, and the note that
  unknowns lower the score on purpose. The formula is unchanged (#789, #891).
- The 404 page has a search box that opens the explorer with the query and links six popular providers (#789).
- The README TL;DR row "The fastest inference" (Groq or SambaNova, "far
  faster than typical GPU-served APIs") had no source. It is now "Published
  speed figures", generated from `published_speed` and checked by a test:
  each provider's own figure for the model two providers publish, labelled
  as a claim that neither says applies to the free tier. The unsourced
  "fastest" wording also leaves the /best/ picks of Groq and SambaNova and
  Cerebras's `best_for` (#728).
- Receipts backfill for the four yes/no flags (`card_required`,
  `phone_required`, `commercial_ok`, `openai_compatible`): every flag that
  holds a value now has a `field_checks` entry, and all but eight carry the
  provider's own sentence, registered in `data/quotes.json` with its page and
  date. The eight are official pages that render only with JavaScript or
  refuse non-browser clients; they stay `stated` without a quote. The 13
  providers that had no `field_checks` now have them. Where no official
  sentence supports a value, the flag is now unknown with its reason
  (`source_silent`) instead of an unsupported answer: most `openai_compatible:
  false` values, and several `card_required: false` and `phone_required: false`
  values, including Groq's `card_required`. Corrections from the providers'
  own pages: Alibaba Model Studio and Scaleway need a payment method
  (`card_required: true`), Cerebras' free Developer credit is not for
  production (`commercial_ok: false`), Gemini's unpaid quota may not serve
  users in the EEA, Switzerland or the UK (`commercial_ok: "conditional"`),
  and Mixedbread, Fish Audio, AI Horde, Runware and Modal now document an
  OpenAI-compatible API (`openai_compatible: true`). Checked 2026-11-26 and
  2026-11-27, agent-assisted.
- `npm run validate` now enforces the receipts rule: a `card_required`,
  `phone_required`, `commercial_ok` or `openai_compatible` value (true, false
  or `"conditional"`) needs a `stated` `field_checks` entry with the
  provider's own sentence, registered in `data/quotes.json`. Otherwise the
  flag must be `null` with its reason. Eight official pages that
  `quotes:add` cannot read are listed in a time-boxed allowlist (until
  2026-12-31) in `scripts/lib/field-checks.mjs`. An entry fails once its day
  has passed or once it is no longer needed. See `docs/quotes.md`.
- Regeneration bot cut-over, ready for `REGEN_MODE=push` and inert until then:
  in push mode a data pull request no longer regenerates or commits derived
  files. The required "Dataset integrity" check regenerates before its checks
  and blocks only derived files a pull request edits by hand, release pull
  requests that are not regenerated and drift outside the bot's allowlist; the
  site deploys after "Regenerate derived files" finishes on `main`; Lighthouse
  performance skips the bot's pushes. With any other mode every workflow
  behaves as before. See `docs/regeneration-bot.md` (#809). Agent-assisted.
- Maintenance: a post-merge regeneration workflow, `regenerate.yml`, in
  shadow mode and off by default (`REGEN_MODE` unset). After a push to
  `main` that changes canonical inputs it rebuilds the derived files from
  `main`, checks that every changed path is a generated target and that a
  second build changes nothing, then opens a draft pull request from
  `chore/regenerate-derived` through a dedicated GitHub App, or only reports
  the diff while no App is configured. Pull requests still ship their
  regenerated files until the switch to direct push; see
  `docs/regeneration-bot.md` (#715).
- Maintenance: the derived files of a pull request, as a patch. When a
  pull request's derived files differ from a fresh build, the "Dataset
  integrity" check lists them in its run summary and uploads them as the
  `regen-preview-patch` artifact, so they can be applied with
  `git apply --binary` without a local build. It started as a separate
  `regenerate-preview.yml` workflow while the regeneration bot was in
  shadow mode (#742), and now runs inside `verify.yml` instead of a
  second full build of every pull request. See `docs/regeneration-bot.md`.
- **Nothing changes for API and dataset consumers:** `generated` in
  `/api/v1/*`, the site's `providers.json`, the CSV column
  `dataset_generated`, `llms.txt` and the sitemap still means the date of
  the last dataset change, now derived from the newest date recorded in the
  data. In the canonical `data/providers.json`, `generated` is now the
  dataset release date and changes only with `version`; `date-released` in
  `CITATION.cff` is that release date. Data pull requests no longer edit
  `generated` or `CHANGELOG.md` (changelog entries are fragments in
  `changes/unreleased/`), so open data pull requests stop conflicting on
  those lines. The README freshness badge is served by the site and refreshed
  on every deploy (#702).
- The 17 retired provider and comparison URLs that Google still knew (and reported as 404 in Search
  Console) now redirect: a retired provider to its section on `/not-free/`, a retired comparison to
  the interactive `/compare/?compare=a,b` view while both providers are listed, otherwise to
  `/compare/`. The map lives in `data/redirects.json`; each stub is `noindex`, carries a canonical
  link and stays out of the sitemap, and the build fails if a source is built as a real page again
  or a target does not exist (#890). Agent-assisted.
- Weekly re-verification batch for the week of 2026-12-01 (agent-assisted,
  official pages only, run 2026-11-25), with `field_checks` for the flags
  checked. AI Horde, SiliconFlow, Baseten and Camb.ai move `last_verified` to
  2026-11-25. AI Horde's rate limits now follow its service reference: 2/second
  and 90/minute per address on ordinary submit routes, 60/minute for text/chat
  status polling and a default account concurrency of 30. The per-API-key
  limits and the 10/minute image polling figure are gone, because the cited
  reference does not state them. SiliconFlow's phone requirement is now
  sourced: its privacy policy asks for a mobile number and a verification code
  at registration. Camb.ai's Free plan allows 500 characters per generation and
  watermarks videos. Its card requirement is not stated, and Baseten's card
  and phone requirements are still not stated. Nothing else changed for Baseten (#791).
- OVHcloud AI Endpoints' data policy and anonymous rate limit were re-read, but
  its catalog's Free labels could only be partly read, so it keeps its
  `last_verified`. Google Gemini could not be re-read, because its docs now
  redirect to aistudio.google.com, so nothing changed for Gemini (#791).
- Upstage's terms now show a version effective 2026-11-30, in which the quoted
  Article 22(6) sentence continues past "(including training)". The quote and
  its register entry drop the final period. The promotional exception is
  unchanged, so `trains_on_prompts` stays unknown (#791).
- Weekly re-verification batch for the week of 2026-12-08 (agent-assisted,
  official pages only, run 2026-11-25). Google Gemini, OVHcloud AI Endpoints,
  Cartesia, ElevenLabs and Gladia move `last_verified` to 2026-11-25 (#818).
- Google Gemini's free tier now lists the models its pricing page gives as
  "Free of charge" on the Free Tier: Gemini 4 Hydrogen, 3.8 Flash, 3.6 Flash,
  3.5 Flash-Lite, 3.1 Flash-Lite, 3 Flash Preview, 2.5 Flash-Lite, embeddings,
  the Flash TTS models and Gemma 4. Gemini 2.5 Pro and 2.5 Flash are deprecated,
  and API access to the 2.5 models is limited to existing users. Google's HTML
  docs now need scripts, so these facts were read from the official Markdown
  sources on ai.google.dev. Its terms page could not be read, so its data policy
  is unchanged (#818).
- OVHcloud AI Endpoints' catalog now marks ten models as Free. The new ones are
  three Olala-v1.0 text-generation models, so the entry now counts as a text LLM
  (`is_text_llm: true`). Stable Diffusion XL is being retired, with end of life
  on 2027-02-10 (#818).
- ElevenLabs' rate limits now give the Free plan's concurrency for each model
  family: 2 for Multilingual v2, 4 for Flash, 8 for Speech to Text and 6 for
  Realtime Speech to Text (#818).
- Fireworks AI's data policy was re-read (privacy notice last modified
  2026-09-16). Its $1 trial credit is not stated on the pages read, so it keeps
  its `last_verified` (#818).
- The source watch (#771) reported that the pages behind these quotes had
  changed. The quotes were re-read and their register entries refreshed, with
  no change to the data: Cartesia (its terms moved to www.cartesia.ai),
  ElevenLabs, Fireworks AI, AI21 Labs, AssemblyAI, Deepgram and Jina AI (#818).
- Weekly re-verification (agent-assisted, official pages only) of five entries
  last verified 2026-11-14, with `field_checks` for the flags checked. Cerebras,
  Pinecone Inference and Datalab move `last_verified` to 2026-11-24. Datalab now
  gives new accounts a one-time credit that does not expire ($10 at signup plus
  $10 with a card on a work email, $5 plus $5 on a personal one) instead of a
  monthly allowance, so it moves to `trial` / `trial-credit` with a sourced
  `no_expiry`; its free rate limits are 25 requests/min and 25 concurrent, and
  its phone requirement is now unknown (needs an account). Pinecone's card
  requirement is not stated by Pinecone, so `card_required` becomes unknown.
  Google does not say whether Gemini signup needs a phone, so its
  `phone_required` becomes unknown and the README TL;DR lists it as "No card;
  phone not confirmed"; its notes add that API access to the 2.5 models is
  limited to existing users and that 2.5 Pro TTS has no free tier. OVHcloud AI Endpoints'
  data policy was re-read; its Free model labels could not be read, so OVHcloud
  and Gemini keep their `last_verified` (#723, #725).
- Weekly re-verification batch for the week of 2026-12-15 (agent-assisted,
  official pages only, run 2026-11-26). Hugging Face, IBM watsonx.ai, LlamaParse,
  Mixedbread, Nanonets, Nutrient, Retell AI and Runware move `last_verified` to
  2026-11-26; their free tiers, headline numbers and catches match the
  providers' own pages (#875).
- IBM watsonx.ai's Lite limits (2 inference requests per second, 300,000 tokens
  per month) were re-read on the runtime plans page, so `free_limits.checked`
  moves to 2026-11-26 (#875).
- Novita AI updated its Terms of Service on 2026-11-26; the training sentence and
  the commercial-use clause are unchanged, and the dates in its notes are
  updated. Its rate-limit numbers could not be read from the docs page, so it
  keeps its `last_verified` (#875).
- Retell AI updated its Terms of Service on 2026-10-25; the recording and
  training sentence is unchanged, and the dates in its notes are updated (#875).
- Fireworks AI's data policy was re-read. Its $1 trial credit is still not
  stated on the pages read, so it keeps its `last_verified` (#875).
- The source watch reported changed pages behind the quotes of Novita AI,
  Retell AI and Runware. Every quoted passage is still on its page; the quotes
  of these three and of Fireworks AI, Hugging Face, IBM watsonx.ai, LlamaParse
  and Mixedbread were re-read and their register entries refreshed (#875).
- SambaNova Cloud re-read on its official pages (agent-assisted): `field_checks`
  now record why `phone_required` stays unknown (quickstart, plans page and
  terms are silent) and the sentence behind `commercial_ok: false` (all
  SambaCloud models are Preview models, for evaluation and developer
  experimentation only). Its card requirement still has two official pages that
  disagree. The free limits, models and notes are unchanged (#726).
- Re-verified Deepgram, AssemblyAI and Jina AI (agent-assisted, official pages
  only, read 2026-11-27): `last_verified` moves to 2026-11-27, and their
  data-policy sentences were re-read.
- Deepgram: the no-expiry passage now quotes the current pricing FAQ; the no-card
  and commercial-use flags carry the providers' sentences; `phone_required` is
  `null` (`source_silent`).
- AssemblyAI: the free tier adds the pricing FAQ's 185 hours of pre-recorded or
  333 hours of streaming transcription; the no-card and commercial-use flags carry
  the providers' sentences; `phone_required` is `null` (`source_silent`).
- Jina AI: `commercial_ok` is now `conditional`: the hosted API is covered by the
  service terms, but jina-embeddings-v4 has no commercial option, through the API
  either. `card_required` and `phone_required` are `null` (`source_silent`).
- Re-verified the next ten oldest verifications (agent-assisted, official pages
  only, read 2026-11-26): Upstage, Fireworks AI, Smallest.ai, Veryfi, Voyage AI,
  NVIDIA NIM, W&B Inference, AI21 Labs and Novita AI move `last_verified` to
  2026-11-26. Poolside was re-checked but stays unverified (#939).
- Veryfi: numeric `free_limits` added (100 requests a month: the pricing FAQ
  counts one API request per document); the no-card and commercial-use flags now
  carry the providers' sentences (#939).
- Upstage: the FAQ no longer mentions sign-up free credits, so the free tier now
  says what the pages state (keyless testing from the docs and Playground, 10
  free runs per Studio agent) and records it as anonymous access;
  `commercial_ok` is `null` (`source_silent`) (#939).
- Voyage AI: the pricing page now agrees that rerank-3 and rerank-3-lite get
  200M free tokens and no longer lists voyage-code-2; `card_required` is `null`
  (`source_silent`) (#939).
- W&B Inference: `card_required` and `commercial_ok` are `null`
  (`source_silent`); the pricing page describes the Free plan as for personal
  development (#939).
- Poolside: `card_required` is `null` (`source_silent`); the Platform page no
  longer renders without scripts, so the October 31 shutdown notice could not be
  re-read (#939).
- Fireworks AI, AI21 Labs, Smallest.ai and Novita AI: card and commercial-use
  flags now carry the providers' sentences (#939).
- Re-verified the eight oldest verifications (agent-assisted, official pages
  only, read 2026-11-26): Z.ai, OCR.space, Typhoon, Rime, Rev AI, Vercel AI
  Gateway, Sarvam AI and Photoroom move `last_verified` to 2026-11-26 (#925).
- Vercel AI Gateway: the free tier is now stated as a $5/month credit, and the
  getting-started page says free credits need a valid payment method on the
  team, so `card_required` is `true` (#925).
- Photoroom: `card_required` is `null` (`sources_disagree`): the API pricing
  FAQ says no card is needed, the terms say a Free Account must provide a
  payment method (#925).
- Typhoon: the API models page now lists four models (adds
  typhoon-v2.1-12b-instruct, drops five ids it no longer lists), and its
  rate-limit table adds typhoon-v2.1-12b-instruct. `commercial_ok`,
  `card_required` and `phone_required` are `null` (`source_silent`) (#925).
- Z.ai: `card_required` and `phone_required` are `null` (`source_silent`);
  `commercial_ok` keeps `true` with the terms' sentence recorded (#925).
- Rev AI: `card_required` is `null` (`source_silent`); a data policy is
  recorded (the terms allow training on speech-to-text Customer Content); the
  key page is linked (#925).
- OCR.space: card, phone and commercial-use flags now carry the providers'
  sentences, and a data policy is recorded (uploads deleted after processing) (#925).
- Sarvam AI: `commercial_ok` is now backed by the commercial licensing page;
  the unsupported "commercial production rights for Output" wording is replaced (#925).
- Rime and Photoroom: the API key pages are linked (#925).
- `robots.txt` now holds the whole crawler policy, reviewed in pull requests,
  instead of a block managed in Cloudflare.
  - Search engines and AI search or user agents may crawl every page: Googlebot,
    Bingbot, Baiduspider, PetalBot, OAI-SearchBot, ChatGPT-User,
    Claude-SearchBot, Claude-User and PerplexityBot. Baiduspider and PetalBot
    were blocked before.
  - AI training crawlers (GPTBot, ClaudeBot, CCBot, Google-Extended and the
    others the managed block listed) may fetch the machine-readable data
    files: `llms.txt`, `llms-full.txt`, `providers.json`, `providers.csv`,
    `feed.xml`, `changes.xml`, the sitemaps and `/api/`. They may not fetch
    the HTML pages.
  - The `Content-Signal:` line that Search Console flagged is gone, and so is
    the duplicate `User-agent: *` group.
  - `scripts/robots.test.mjs` parses the file and checks these rules (#767).
- The published API schema `/api/v1/schema.json` now sets
  `additionalProperties: true` on every object (envelope, provider and nested
  objects such as `field_checks`), so a strict validator no longer rejects
  fields added within v1, such as `field_checks`, `published_speed` and
  `anonymous_access`. Listed fields keep their types, enums and required rules.
  The canonical `data/schema.json` stays closed, so `scripts/validate.mjs`
  still rejects a misspelt or undeclared field in the dataset. Clients holding
  an older copy of the schema should refresh it (`docs/api.md`).
  Agent-assisted (#760).
- Site: the Content-Security-Policy of every page is tighter. It adds
  `script-src-attr 'none'`, `font-src 'self'`, `manifest-src 'self'`,
  `worker-src 'none'`, `form-action 'self'` and `upgrade-insecure-requests`,
  and the two inline-script hashes are now computed by the build from the
  scripts it writes instead of being typed in by hand. Redirect stubs get
  `default-src 'none'`. A new test (`scripts/csp.test.mjs`) pins the exact
  policy, checks every inline script is hashed, and rejects inline event
  handlers, mixed content, unpinned third-party subresources and
  `target="_blank"` links without `rel=noopener`.
- Site: with Google Analytics on, the `_ga` and `_gcl` cookies gtag writes
  after consent are now `Secure; SameSite=Lax` (`cookie_flags` in the gtag
  config); gtag's default set neither.
- The embeddable widget renders with its styles again: the quoted `Segoe UI` font name
  closed the inline `style` attribute early, so the box lost its colours and border (#891).
- `/changes/`: the "no revision" months use the table's text font instead of the
  browser default (#891).
- Guides: the "Checked" date no longer wraps across two lines (#891).
- Counts read the same way everywhere: a provider page says "#N of 76 scored", and the
  production checklist guide counts every figure over the verified providers it
  says it covers, instead of mixing in the tracked total (#891). Agent-assisted.
- Maintenance: a weekly, report-only source watch (`source-watch.yml`,
  `scripts/source-watch.mjs`) re-reads every page cited in `data/quotes.json`
  the way `npm run quotes:add` reads it and keeps one "Source watch: quotes to
  re-check" issue: quotes no longer on their page, per provider, and fetch
  errors that lasted two runs in a row (404/410 at once). It is closed when a
  run is clean. Pages whose text changed while the quote is still present are
  listed as low priority. It never edits data, uses no secret, has only
  `contents: read` and `issues: write`, and lists our own ids and URLs, never
  page text; the run-to-run memory lives in the issue body, not the repository.
  See `docs/update-playbook.md#source-watch` (#771).
- The weekly re-verification batch (issue #4 and `npm run reverify`) now asks
  for at least 6 entries a week, the approved pace, and spreads same-day
  cohorts out: while a coming week has more than 8 entries becoming due (day
  61), entries due by then are pulled forward, oldest first, from 7 days old
  instead of waiting until they are 28 days old. Ties are broken by slug, so
  the batch does not depend on file order. This staggers the 45 entries
  verified on 2026-11-19 and 2026-11-20, which would otherwise all become due
  in the week of 2027-01-18 and overdue in mid-February. Agent-assisted (#766).
- Structured data: fixed the errors and warnings Google's Rich Results Test
  reported. Every `Dataset` node (on provider pages, `/not-free/`, `/api/`,
  `/quality/`, `/embed/` and the long guides) now carries a `description` (one
  sentence from the data: what is free, the verified-provider count and the
  data date) and the dataset's MIT `license`. Guide `Article`s name the
  maintainer as `author`, Tweakeo as `publisher`, the guide's OG image as
  `image`, and a `datePublished`. Every `datePublished` and `dateModified` is
  now a full ISO 8601 datetime with a timezone (`2026-11-24T00:00:00Z`). The
  home `Dataset` no longer has an `isPartOf` pointing at the `WebSite`, and
  provider pages are now `isPartOf` the `WebSite` and `about` the `Dataset`.
  `scripts/structured-data.test.mjs` walks every built page's JSON-LD and
  checks these rules (#904).
- The explorer and the provider pages show card, phone, commercial use and training on prompts through one flag, in that order, drawn with a shape as well as a colour: ✓ when it holds, ✕ when it does not, ~ when commercial use is conditional and a dashed ? when the provider's docs do not confirm it. Screen readers hear the whole answer, for example "Card required: unknown — not stated in the provider's docs" (#813). Agent-assisted.
- The modality filter of the explorer drops the emoji from its options, which screen readers announced ("speech balloon, Text / LLM"), and shows a small dot in the colour of the selected modality instead (#813, issue #792). Agent-assisted.
- Trial credits re-checked against each provider's own pages for all 42 trial providers (2026-11-27); no trial has ended.
- Speechmatics: the $100 sign-up credit now lasts 12 months (`expires` was unset); the pricing FAQ says "Sign-up bonus, credit-pack credits and annual subscription credits last 12 months."
- Mixedbread: when the $5 Starter credit is used up, the pricing page says to upgrade to the Scale plan ($20/month); the standalone embedding and reranking APIs are no longer in the current docs, so the free tier now describes the managed search stores.
- AssemblyAI: the notes now say the $50 credit does not expire and quote the billing FAQ's current wording.
- Voicegain: the free tier now says the console signup page gives $50 with a business email and $5 otherwise.
- `field_checks` recorded for fourteen more providers whose official pages
  were read on 2026-11-25 (UTC) and do not settle the flag (`source_silent`):
  `phone_required` for Speechmatics, Unreal Speech, Gladia, Rime, Cartesia,
  Fish Audio, Rev AI, Nutrient, Veryfi, Voicegain, Smallest.ai, CAMB.AI and
  Google Agent Platform express mode, and `commercial_ok` for Fireworks AI,
  Voicegain, CAMB.AI and Google Agent Platform express mode. The flags stay
  unknown; the site shows why and when they were checked (#738, issues #7 and #8).
  Agent-assisted: an AI agent read the pages and drafted the entries for
  maintainer review.
- Photoroom: `commercial_ok` is now `false`, sourced from its terms, which
  license Free Accounts "for your own personal, non commercial purposes"
  (#730, issue #8).
- `field_checks` recorded for nine providers whose official pages were read
  on 2026-11-24 and do not settle the flag (`source_silent`): `phone_required`
  for Moondream, Modal, Voyage AI, Twelve Labs, Retell AI and Regolo, and
  `commercial_ok` for Moondream, Voyage AI, Twelve Labs, Rime, Retell AI,
  Regolo and Unstructured. The flags stay unknown; the site now
  shows why and when they were checked (#730, issues #7 and #8). Agent-assisted: an AI agent
  read the pages and drafted the entries for maintainer review.
- Alibaba Model Studio and ModelScope: `phone_required` is now `true`. The
  Alibaba Cloud registration guide says an account registered with an email
  address "must complete secure phone number verification", and the ModelScope
  registration form asks for a mobile number and an SMS code (#743, issue #7).
- `field_checks` recorded for five flags whose official pages were read on
  2026-11-25 and do not settle them (`source_silent`): `phone_required` for
  IBM watsonx.ai, Unstructured, Photoroom and Poolside, and `commercial_ok`
  for Poolside. The flags stay unknown; the site shows why and when they
  were checked (#743, issues #7 and #8). Agent-assisted: an AI agent read the pages
  and drafted the entries for maintainer review.
- The home page no longer jumps on a phone while it loads (PageSpeed measured a layout shift of 0.188): the menu is
  collapsed behind its button from the first paint instead of showing its links until the page script ran. Without
  JavaScript the links still sit under the brand. Both JetBrains Mono weights are now preloaded and declared in each
  page's head with `font-display: optional`, so a late font cannot re-flow the text either (#724).
- Stylesheets, scripts and fonts are linked with a hash of their content (`styles.css?v=…`), so a page never runs
  with an outdated script and these files can be cached for a long time (#724).
- `/.well-known/security.txt` (RFC 9116) points to private vulnerability reporting and SECURITY.md, and
  `/favicon.ico` no longer answers 404 (#724).
- Structured data for the pages that had none: `/models/`, `/compare/` and `/programs/` are a `CollectionPage`
  with the list of their pages, `/changes/` and `/updates` a `CollectionPage`, `/api/` a `WebPage` about the
  dataset, and each static comparison lists its two provider pages. Every list now points to pages of this site:
  the collections listed each provider's own docs, which Google ignores in a list (#735).
- Every comparison page in the sitemap is now linked from `/compare/` ("More comparisons"), and the credit-program
  pages link back to `/programs/`; 15 pages could only be found through the sitemap (#735).
- `/updates/page/2/` onwards carry `noindex,follow`: thin lists of commit titles that only the first page needs
  to be indexed for (#735).
- Every page advertises the weekly change feed (`changes.xml`), and both feeds carry their own URL
  (`atom:link rel="self"`) (#735).
- The comparisons, the coding tools and the API have their own social image instead of the site-wide one (#735).
- `/api/` says that the API answers plain `GET` requests: custom headers trigger a preflight the host refuses (#735).
- Cookie settings: when reopened from the footer, Escape closes the panel without changing the choice and returns
  focus to "Cookie settings" (#735).
- A coding-tool page linked the `.html` address of a collection (#735).
- Weekly re-verification (agent-assisted; quotes in the pull request) (#734, issue #4):
  - Moondream Cloud (`moondream`) and Modal (`modal`) re-confirmed against
    their own pages: `last_verified` and `data_policy.checked` moved to
    2026-11-24. `card_required` now has a stated source for both: Moondream's
    home page says no credit card is required, and Modal's billing guide
    says a payment method must be on file to use Modal at all. Modal's notes
    add that the $30 Starter credit covers compute only; free usage of
    Modal's Model APIs is not part of Starter since 2026-09-01.
  - SambaNova Cloud (`sambanova`): the Developer Tier is also capped at 20M
    tokens per day across all models. The Free Tier limits are unchanged.
  - Tencent Hunyuan (`tencent-hunyuan`): the international endpoints page now
    lives at www.tencentcloud.com (updated 2026-11-16), and its Silicon Valley
    host is tokenhub-us.tencentcloudmaas.tech.
- Maintenance: `scripts/workflow-policy.test.mjs` checks every workflow in
  `.github/workflows` for the rules the existing ones already follow: actions
  pinned by full commit SHA with a version comment, top-level `permissions:`,
  `persist-credentials: false` on every checkout, no checkout or repository
  script under `pull_request_target` or `workflow_run`, and no pull request,
  issue or comment text pasted into a `run:` script. A new workflow that drops
  one of them fails in its own pull request, with the file and line (#749).
- Maintenance: a failing Verify run on `main` (after a merge) now opens one
  "Verify failed on main" issue, comments on it while `main` stays broken and
  closes it on the next clean run, like the nightly Lighthouse performance
  check. The report job checks nothing out and can only write issues; pull
  requests never reach it. This is the alert the roadmap asks for before the
  strict up-to-date rule can be relaxed (#749).
