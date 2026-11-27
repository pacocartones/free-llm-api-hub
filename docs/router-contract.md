# Router data contract (design for dataset 2.17.0)

> **Status: design draft, nothing implemented.** This page describes fields planned for dataset **2.17.0** (March 2027). No schema, validator, data or generated file carries them yet. It builds on two v2.16.0 changes that are not merged either: `free_limits.per_model` and `/api/v1/models.json` ([pacocartones/free-llm-api-hub#774](https://github.com/pacocartones/free-llm-api-hub/pull/774)), and the terms flags `multi_account_forbidden` / `limit_circumvention_forbidden` ([pacocartones/free-llm-api-hub#933](https://github.com/pacocartones/free-llm-api-hub/pull/933)). Names, types and values here can still change until the 2.17.0 implementation PR is reviewed.

API routers and gateways (key pools, LiteLLM-style proxies, a possible router of this project) read the dataset to decide where a request may go. Today they can read *how much* a free tier gives (`free_limits`) and, from v2.16.0, *whether the terms forbid pooling accounts* (the terms flags). They cannot read **who the limit is counted against**, **when it resets**, **how to authenticate**, **where and for whom the free tier is available**, or **whether a key may be handed to someone else**. Without those, a router has to guess, and a guess in the wrong direction breaks the provider's terms.

This contract adds those facts, with the same receipts as every other field: the provider's own sentence, its page and the day it was read. It is written so that a router can **respect** limits and terms. Nothing in it describes how to get around a limit, a region rule or an identity check, and the project will not record such information.

Contents:

1. [Principles](#principles)
2. [Fields](#fields): [`free_limits.applies_per`](#free_limitsapplies_per), [`free_limits.reset`](#free_limitsreset), [`auth`](#auth), [terms flags in `models.json` and `status.json`](#terms-flags-in-modelsjson-and-statusjson), [`availability`](#availability), [`key_sharing_forbidden` (study)](#key_sharing_forbidden-study)
3. [How a router must treat the values](#how-a-router-must-treat-the-values)
4. [Compatibility and versioning](#compatibility-and-versioning)
5. [Validation rules to add](#validation-rules-to-add)
6. [Open questions](#open-questions)
7. [Where the examples come from](#where-the-examples-come-from)

## Principles

These are the rules the existing dataset already follows ([methodology](methodology.md), [quoted passages](quotes.md)); the new fields follow them too.

- **Only what the provider states.** A value is recorded only when one of the provider's own pages states it. Third-party pages, forum posts by non-staff, measured behaviour and response headers seen at runtime do not count.
- **Not stated = `null`.** A value the pages do not state is `null` (or the key is absent), never `false`, never a default, never a guess. The reason for a `null` is recorded in `field_checks` (`source_silent`, `needs_account` or `sources_disagree`); a field with no check entry is `not_checked`.
- **Every recorded value has a receipt.** Either a `field_checks` entry with `status: "stated"` and the provider's sentence in `quote` (registered in `data/quotes.json` as `field_sentence`), or, for list-shaped facts, an entry that carries its own `source`, `checked` and `quote` (the pattern `published_speed` already uses).
- **Additive only.** Every new key is optional. No existing field is renamed, removed, retyped or given a new meaning (see [Compatibility and versioning](#compatibility-and-versioning)).
- **Respect, never circumvent.** The fields describe constraints. A router uses them to stay inside the constraints, never to find the edge of one.

## Fields

Each field below gives its definition, type, allowed values, how it is sourced, and three real examples: **Groq** (`groq`), **Google Gemini API** (`google-gemini`) and **OpenRouter** (`openrouter`). The examples were read on **2026-11-27** (see [Where the examples come from](#where-the-examples-come-from)); they show the values the 2.17.0 data PR would record, and they are not in `data/providers.json` yet.

### `free_limits.applies_per`

**Definition.** The entities across which the provider counts the free limits in `free_limits`: the thing a counter belongs to. If a provider counts per organization, ten keys of one organization share one counter, and adding keys adds no capacity.

| | |
|---|---|
| Location | inside the existing `free_limits` object (provider level). Applies to the provider-wide numbers and to every `free_limits.per_model[]` entry (from #774) unless [an open question](#open-questions) decides otherwise. |
| Type | array of unique strings, at least one item, or `null` |
| Allowed values | `key` (each API key has its own counter), `account` (the user account), `organization` (an organization or team that can hold several users and keys), `project` (a project that holds keys, as Google Cloud projects do), `ip` (the client IP address), `model` (each model has its own counter) |
| `null` / absent | the provider's pages do not say what the limit is counted against |
| Evidence | `field_checks.limits_applies_per` (the existing `field_check` shape). `stated` with the provider's sentence for a value; `source_silent` with a note for `null`. |

`project` is not in the list Paco approved (key, account, organization, IP, model); it is proposed because Google states its limits per project, and folding a project into `organization` or `account` would misstate it. See [open questions](#open-questions).

Several values combine: `["organization", "model"]` means one counter per (organization, model) pair. A value is listed only when the quoted sentence names it; a per-model table alone does not add `model` (see [open questions](#open-questions)).

**Examples.**

- **Groq.** Recorded: `["organization"]`.
  `field_checks.limits_applies_per`: `stated`, source <https://console.groq.com/docs/rate-limits>, quote: “Rate limits apply at the organization level, not individual users.”
- **Google Gemini API.** Recorded: `["project"]`.
  `field_checks.limits_applies_per`: `stated`, source <https://ai.google.dev/gemini-api/docs/rate-limits>, quote: “Rate limits are applied per project, not per API key.”
- **OpenRouter.** Recorded: `null`.
  `field_checks.limits_applies_per`: `source_silent`, source <https://openrouter.ai/docs/api-reference/limits>, note: the page says what the limit is *not* counted against (“Making additional accounts or API keys will not affect your rate limits, as we govern capacity globally.”) and that “We do however have different rate limits for different models”, but it names no entity a counter belongs to. Whether that second sentence establishes `model` is an [open question](#open-questions). For a router the first sentence already settles the practical point: more accounts or keys give no more capacity, and creating them for that purpose is forbidden by the terms (see the terms flags below).

### `free_limits.reset`

**Definition.** How and when each free limit is replenished, per unit of `free_limits`.

| | |
|---|---|
| Location | inside `free_limits` |
| Type | array of reset entries (1 to 6), or `null` |
| Entry | `{ units, kind, timezone, window_seconds, source, checked, quote }` |
| `units` | array of unique unit names of `free_limits` that this entry covers: `requests_per_second`, `requests_per_minute`, `requests_per_day`, `requests_per_month`, `tokens_per_day`, `tokens_per_month`. Each must be a unit recorded in the same `free_limits` (or in a `per_model` entry), and a unit appears in at most one entry. |
| `kind` | `fixed_window` (the counter empties at the end of each window of the unit's length, counted from a point the provider does not tie to a calendar), `rolling` (a sliding window: usage older than the window stops counting), `calendar_day` (resets at midnight of `timezone`), `calendar_month` (resets on the first day of the month at midnight of `timezone`) |
| `timezone` | IANA time zone name (`UTC`, `America/Los_Angeles`, …). Required for `calendar_day` and `calendar_month`; `null` otherwise. The quote carries the provider's own words (“Pacific time”); the mapping from words to an IANA name uses a small fixed table in the validator, never a guess. |
| `window_seconds` | integer ≥ 1 for `rolling` and `fixed_window` when the page states a window length different from the unit (for example a rolling 10-minute window); `null` otherwise |
| `source`, `checked`, `quote` | the provider's page, the day it was read (UTC), and the sentence that states the reset, registered in `data/quotes.json` (a new kind, `reset_quote`, id `<slug>.reset.<unit>`) |
| `null` / absent | no reset is stated for any unit. The reason goes in `field_checks.limits_reset`. A unit with a number but no reset entry has no stated reset. |

Units the page states nothing about are left out of every entry; they are never filled in by analogy (a stated daily reset says nothing about the per-minute counter).

**Examples.**

- **Groq.** Recorded: `null`.
  `field_checks.limits_reset`: `source_silent`, source <https://console.groq.com/docs/rate-limits>, note: the page documents the headers `x-ratelimit-reset-requests` (“Always refers to Requests Per Day (RPD)”) and `x-ratelimit-reset-tokens`, which give the time left at runtime, but it does not say whether the day is a calendar day, a rolling window or a fixed window. A router can read those headers at runtime; the dataset records no kind.
- **Google Gemini API.** Recorded:
  ```json
  [{ "units": ["requests_per_day"], "kind": "calendar_day", "timezone": "America/Los_Angeles", "window_seconds": null,
     "source": "https://ai.google.dev/gemini-api/docs/rate-limits", "checked": "2026-11-27",
     "quote": "Requests per day (RPD) quotas reset at midnight Pacific time." }]
  ```
  `requests_per_minute` has no entry: the page does not say how it resets. The same page describes a “rolling 10-minute window” for spend-based limits of paid tiers; it is not a free limit and is not recorded.
- **OpenRouter.** Recorded:
  ```json
  [{ "units": ["requests_per_day"], "kind": "calendar_day", "timezone": "UTC", "window_seconds": null,
     "source": "https://openrouter.ai/docs/api-reference/limits", "checked": "2026-11-27",
     "quote": "Free-model requests allowed per UTC day" }]
  ```
  The quote is a comment in the page's `GET /api/v1/key` response type (`free_model_daily_requests.limit`). Whether a code comment is an acceptable `quote` is an [open question](#open-questions); if it is not, the value is `null` with `source_silent`. `requests_per_minute` has no entry.

### `auth`

**Definition.** How the provider's own docs say a client authenticates: the environment variable name its docs and SDKs use for the key, and the HTTP header the key is sent in. It is never a key value.

| | |
|---|---|
| Location | new optional object on a provider |
| Type | object or `null` |
| `env_var` | string matching `^[A-Z][A-Z0-9_]*$`, or `null`: the variable name the provider's docs tell users to set, or its SDK reads by default |
| `env_var_alternatives` | array of such names, or `null`: other names the docs say the SDK also reads, in the docs' order |
| `header` | HTTP header name (RFC 9110 token), or `null`: the header the docs send the key in, for the provider's native API |
| `scheme` | `Bearer`, `Basic`, `Token`, or `null` when the key is the whole header value (as with `x-goog-api-key`) |
| `null` / absent | nothing recorded |
| Evidence | `field_checks.auth_env_var` and `field_checks.auth_header`, one each, because the two facts usually come from different lines of the docs. The `quote` may be a line of a code sample on the provider's page (see [open questions](#open-questions)). |

**Relation to `env_key`.** The existing `env_key` is *operational*: it names the secret this project's probe reads (`scripts/probe.mjs`), it is stripped from `providers.json`, and it is published only in `openai-clients.json` and `litellm.yaml`. `auth.env_var` is a *provider fact* with a receipt. They usually match, but they are different claims: `env_key` stays as it is, and the validator only warns when both are set and differ. A key value is never stored in either.

`auth` describes the native API. A provider's OpenAI-compatible endpoint (`openai_base_url`) is called with `Authorization: Bearer` by every OpenAI SDK by construction; whether to record that separately is an [open question](#open-questions).

**Examples.**

- **Groq.** Recorded: `{ "env_var": "GROQ_API_KEY", "env_var_alternatives": null, "header": "Authorization", "scheme": "Bearer" }`.
  `field_checks.auth_env_var`: `stated`, source <https://console.groq.com/docs/quickstart>, quote: “By default, the provider will look for `GROQ_API_KEY` as the API key.” (the page's shell step is `export GROQ_API_KEY=<your-api-key-here>`).
  `field_checks.auth_header`: `stated`, source <https://console.groq.com/docs/quickstart>, quote (code sample): `-H "Authorization: Bearer $GROQ_API_KEY"`.
- **Google Gemini API.** Recorded: `{ "env_var": "GEMINI_API_KEY", "env_var_alternatives": ["GOOGLE_API_KEY"], "header": "x-goog-api-key", "scheme": null }`.
  `field_checks.auth_env_var`: `stated`, source <https://ai.google.dev/gemini-api/docs/api-key>, quote: “Set the environment variable `GEMINI_API_KEY` or `GOOGLE_API_KEY`.” The same page adds: “If both are set, `GOOGLE_API_KEY` takes precedence.” (that goes in the note; `env_var` holds the name the page gives first).
  `field_checks.auth_header`: `stated`, same source, quote (code sample): `-H "x-goog-api-key: YOUR_API_KEY"`.
- **OpenRouter.** Recorded: `{ "env_var": null, "env_var_alternatives": null, "header": "Authorization", "scheme": "Bearer" }`.
  `field_checks.auth_header`: `stated`, source <https://openrouter.ai/docs/api-reference/authentication>, quote: “If you’re calling the OpenRouter API directly, set the `Authorization` header to a Bearer token with your API key.”
  `field_checks.auth_env_var`: `source_silent`, same source, note: the page says “Using environment variables and keeping keys out of your codebase is strongly recommended” but names no variable. The `<OPENROUTER_API_KEY>` placeholder in an example on the limits page is a placeholder, not a statement. The dataset's `env_key` is `OPENROUTER_API_KEY`, which is this project's naming, not a provider claim: this is exactly the case where `env_key` and `auth.env_var` differ.

### Terms flags in `models.json` and `status.json`

**Definition.** `multi_account_forbidden`, `multi_account_condition` and `limit_circumvention_forbidden`, defined in #933 on the provider object for 2.16.0, copied unchanged into the two files routers poll, so a router does not have to join `providers.json` to read them. If [`key_sharing_forbidden`](#key_sharing_forbidden-study) is adopted, it is copied the same way.

| File | Where | Values |
|---|---|---|
| `/api/v1/models.json` (#774) | each row of `models[].providers[]` | `multi_account_forbidden`: `true`, `false`, `"conditional"` or `null`; `multi_account_condition`: string or `null`; `limit_circumvention_forbidden`: `true`, `false` or `null` |
| `/api/v1/status.json` | each entry of `providers` | the same three |

- The values are the provider object's values, never re-derived. `"conditional"` is served as is: it is part of the v1 type of `multi_account_forbidden` from #933, unlike `commercial_ok`, which v1 projects to `null`.
- Each key is **always emitted** (with `null` when the provider has no value) so a router can test presence, but the keys are **not added to the schemas' `required` lists**, so a 2.16.0 file still validates against the 2.17.0 schema.
- The receipts (`field_checks`) stay in `providers.json` only. Each `models.json` row already carries `provenance`; `status.json` already carries `oldest_field_check`, which from 2.17.0 also covers the checks of these flags.
- `status.json` keeps `schema_version: 1`. Its schema description gains a sentence that `null` in these fields is never permission.

**Examples** (values recorded by #933, re-read for this design on 2026-11-27 where the host was reachable):

- **Groq.** `multi_account_forbidden: true`, `limit_circumvention_forbidden: true`. Quote (<https://console.groq.com/docs/legal/ai-policy>), in the list of prohibited uses: “beyond published parameters, rate limits, or use limitations, including by registering multiple accounts or orchestrating usage between multiple organizations;”
- **Google Gemini API.** `multi_account_forbidden: null` (`source_silent`), `limit_circumvention_forbidden: true`. Quote (<https://developers.google.com/terms>, section 2(d), incorporated by the Gemini API Additional Terms): “Google sets and enforces limits on your use of the APIs (e.g. limiting the number of API requests that you may make or the number of users you may serve), in our sole discretion. You agree to, and will not attempt to circumvent, such limitations documented with each API.”
- **OpenRouter.** `multi_account_forbidden: true`, `limit_circumvention_forbidden: true`. Quote (<https://openrouter.ai/terms>, section 7): “create a false identity, misrepresent your identity, or create multiple accounts as a single user, for purposes of bypassing or circumventing use limits on the Site or Service or for any other reason;”

A `status.json` entry for Groq in 2.17.0 would read:

```json
"groq": { "last_verified": "2026-11-24", "oldest_field_check": "2026-11-24", "freshness": "fresh", "free_now": true, "last_change": "2026-11-24",
          "multi_account_forbidden": true, "multi_account_condition": null, "limit_circumvention_forbidden": true }
```

(dates illustrative.)

### `availability`

**Definition.** Where, and for whom, the provider says its API (or its free tier) may be used: region rules, identity verification beyond phone and card, and a minimum age.

| | |
|---|---|
| Location | new optional object on a provider |
| Type | object or `null`; each part may be `null` on its own |
| `regions` | array of region rules, or `null` |
| `kyc_required` | `true`, `false`, `"conditional"` or `null`: whether the provider requires identity verification (an identity document, a selfie check, or business verification) to use the free offering. Phone and card stay in `phone_required` and `card_required` and are not KYC here. |
| `kyc_condition` | string or `null`; required and non-blank when `kyc_required` is `"conditional"` (the same pattern as `commercial_ok_condition` and `multi_account_condition`) |
| `min_age` | integer (13 to 21) or `null`: the minimum age the provider's terms set for using the API |
| Evidence | each region rule carries its own `source`, `checked` and `quote` (registered as a new `region_quote` kind). `field_checks.availability_regions` holds the reason when `regions` is `null`. `field_checks.availability_kyc` and `field_checks.availability_min_age` hold the receipts for the other two. |

A **region rule** is `{ effect, who, plan, countries, source, checked, quote, note }`:

| Key | Values |
|---|---|
| `effect` | `allow` (only the listed countries) or `deny` (all but the listed countries) |
| `who` | `account_holder` (where the developer accesses the API from), `end_user` (where the users of the developer's application are), or `both` |
| `plan` | `free` (the rule covers only the free or unpaid offering) or `all` |
| `countries` | array of ISO 3166-1 alpha-2 codes (upper case), expanded from the provider's wording. A named group such as “the European Economic Area” is expanded with a fixed table in the validator, and the quote keeps the provider's words. |
| `note` | optional plain text: a condition the page attaches to the rule |

A rule the provider applies only to some models, without listing countries, is not a region rule: it goes in the note of `field_checks.availability_regions` (see OpenRouter below).

**Examples.**

- **Groq.** Recorded: `{ "regions": null, "kyc_required": null, "kyc_condition": null, "min_age": null }`. No check entry yet: the pages read for this design (rate limits, quickstart, Services Agreement, Acceptable Use Policy) state no country list, KYC step or age. The Services Agreement names a different Groq contracting party by the customer's domicile, which is a contracting rule, not an availability rule. A full read of the terms is needed before recording `source_silent`, so the three stay `not_checked`.
- **Google Gemini API.** Recorded:
  ```json
  { "regions": [
      { "effect": "allow", "who": "both", "plan": "all", "countries": ["AL", "DZ", "AS", "…"],
        "source": "https://ai.google.dev/gemini-api/docs/available-regions", "checked": "2026-11-27",
        "quote": "The Gemini API and Google AI Studio are available in the following countries and territories." },
      { "effect": "deny", "who": "end_user", "plan": "free",
        "countries": ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "CH", "GB"],
        "source": "https://ai.google.dev/gemini-api/terms", "checked": "2026-11-27",
        "quote": "You may use only Paid Services when making API Clients available to users in the European Economic Area, Switzerland, or the United Kingdom." } ],
    "kyc_required": null, "kyc_condition": null, "min_age": 18 }
  ```
  The allow rule is `both` because the terms say “You may only access the Services (or make API Clients available to users) within an available region” (<https://ai.google.dev/gemini-api/terms>); its `countries` is the page's full list (abridged here). The deny rule matters most to a router: a router whose end users are in the EEA, Switzerland or the UK must not send their requests to the Gemini free tier, whatever the router's own location.
  `field_checks.availability_min_age`: `stated`, source <https://ai.google.dev/gemini-api/terms>, quote: “You must be 18 years of age or older to use the APIs.” `kyc_required` stays `null` (`not_checked`).
- **OpenRouter.** Recorded: `{ "regions": null, "kyc_required": null, "kyc_condition": null, "min_age": null }`.
  `field_checks.availability_regions`: `source_silent`, source <https://openrouter.ai/terms>, note: section 5.7 says that “certain Model Providers do not authorize users either (i) acting on behalf of certain entities or organizations, or (ii) who are located in certain countries or regions, to access their Models”, and forbids reaching those models “including without limitation by using virtual private networks and proxies”. The restriction is per upstream model and lists no countries, so there is no provider-level rule to record. A router must apply the upstream model's own terms, and must never route a request through another region to reach a restricted model.

### `key_sharing_forbidden` (study)

Paco asked for a study, not a decision. This section proposes a definition and shows what the data would look like, so the decision can be made with examples in front of it.

**Why routers need it.** Some key pools accept keys donated by different people and serve anyone's requests with them. Even when every donor stays inside the limits, many terms forbid handing a credential to someone else. Neither terms flag of #933 covers that: `multi_account_forbidden` is about one person holding several accounts, `limit_circumvention_forbidden` is about exceeding limits.

**Proposed definition.** `key_sharing_forbidden`: whether the provider's own terms forbid giving, lending, selling or transferring an API key or account access to a person or application outside the account holder's own authorized users.

- `true`: the terms forbid it (including “keep credentials confidential and prevent other API clients from using them”, or “make the account available only to authorized users”).
- `false`: an official page explicitly allows sharing a key with other people or applications (AI Horde's shared keys are an official feature, per the #923 research).
- `null`: not recorded; `field_checks.key_sharing_forbidden` says why. **`null` is never permission.**
- Serving your own application's end users through your own key is **not** sharing under this definition: that is how every API is used. Re-exposing a provider's API to third parties is a different question, covered by [open question 9](#open-questions) (sublicensing and resale).

**Type.** Tri-state (`true | false | null`) with `field_checks`, in the top-level provider object next to the terms flags, copied into `models.json` and `status.json` like them. The #923 research table already notes a sharing clause for many providers (Fireworks AI, Deepgram, LlamaParse, Veryfi, Twelve Labs, Aion Labs, Poolside, Liquid AI, Z.ai, Upstage, Inception and others), so most values come from re-reading pages already read.

**What the three examples would record.**

- **Groq.** `true`. Source <https://console.groq.com/docs/legal/services-agreement>, section 3.2, quote: “Groq has no obligation to provide multiple accounts to Customer. Customer will only make its Account available to Authorized Account Users.” The note says that sharing inside the customer's own authorized users is allowed.
- **Google Gemini API.** `true`. Source <https://developers.google.com/terms>, section 4(b)(1), quote: “Developer credentials (such as passwords, keys, and client IDs) are intended to be used by you and identify your API Client. You will keep your credentials confidential and make reasonable efforts to prevent and discourage other API Clients from using your credentials.”
- **OpenRouter.** `null` (`source_silent`). Source <https://openrouter.ai/terms>, note: section 3.2 makes the account holder responsible for “the confidentiality and security of all API keys” and for all activity under them, and section 4.4 says credits “are non-transferable, including between accounts”, but no sentence forbids sharing a key as such. Section 7 separately forbids accessing the service “for purposes of reselling API access to Models” (see [open question 9](#open-questions)).

**Recommendation.** Adopt it in 2.17.0 with this narrow definition, as a fourth terms flag, with the same rules as the other two (receipts, `null` never permission, copied into `models.json` and `status.json`, a CSV column). The alternative, folding it into `multi_account_forbidden`, would change that field's meaning, which v1 does not allow.

## How a router must treat the values

The dataset cannot enforce anything; these rules say what a router that claims to follow this contract does. They are the same rules a router of this project would follow. They will be repeated, shorter, on the API page and in `docs/api.md` when the fields ship.

### Permission fields: `null` is forbidden by default, `true` is always blocked

Permission fields are `multi_account_forbidden`, `limit_circumvention_forbidden` and, if adopted, `key_sharing_forbidden`.

| Value | What the router does |
|---|---|
| `true` | **Always blocked.** The router never uses more than one account or key of this provider for one end user (multi-account), never spreads load across keys or accounts to exceed a published limit (circumvention), never serves one person's requests with another person's key (key sharing). No configuration, operator flag or user setting turns this off. |
| `"conditional"` | **Blocked**, as for `true`. The condition text is for a human to read; a router cannot verify that a user falls outside it. |
| `null` | **Forbidden by default.** Treated as `true` unless the router operator holds the provider's own written permission for that exact use. Such an override is local to that deployment, recorded with the permission's source and date, and never shipped as a default or shared as a preset. A `null` never becomes permission because the dataset is silent, because other providers allow it, or because a request succeeded. |
| `false` | Allowed **as far as this flag goes**. The provider's page explicitly allows it (the quote says how far). Other fields and the provider's other terms still apply. |

A router decides per (provider, end user). When the dataset has no entry for a provider at all, every permission field is `null`.

### Descriptive fields: `null` means the most restrictive reading

`free_limits.applies_per`, `free_limits.reset`, `auth` and `availability` describe facts rather than permissions. Their `null` cannot block a provider outright (most providers would be blocked), so it means: **assume the reading that uses the least capacity and serves the fewest people.**

| Field | Recorded value | `null` |
|---|---|---|
| `applies_per` | Count usage against the listed entities. Capacity is never “number of keys × limit” unless `key` is listed **and** `multi_account_forbidden` and `limit_circumvention_forbidden` are both `false`. | Assume one counter is shared by every key, account, organization, project and IP the end user (or the operator, for its own keys) controls. Adding keys adds no capacity. |
| `reset` | Expect capacity back only at the stated reset (`calendar_day` at midnight of `timezone`, and so on). | Assume no reset is known. Do not schedule bursts at a presumed reset; on `429`, back off and honour `Retry-After` or the provider's reset headers. |
| `auth` | Send the key in the stated header with the stated scheme; read it from the stated variable name if the router reads variables. | Use the provider's docs; never guess a header that could send the key to the wrong place. |
| `availability.regions` | Do not send a request when the rule excludes it: an `allow` rule whose list lacks the country, or a `deny` rule that lists it, for `account_holder` (the operator's location), `end_user` (the user's location) or `both`. A `plan: "free"` rule applies whenever the free tier would serve the request. | Make no claim that the provider is available in a region. Never infer availability from a successful request. |
| `availability.kyc_required` | `true` or `"conditional"`: the account must have passed the provider's own verification; a router never helps with it and never routes to an account that skipped it. | Unknown; nothing assumed. |
| `availability.min_age` | Do not route requests of users the router knows are below the age, and do not offer the provider in an application directed at them. | Unknown; nothing assumed. |

### Never

Whatever the values, a router following this contract never:

- creates, rotates or pools accounts or keys to obtain more free usage than one account gets;
- routes a request through another region, a VPN or a proxy to reach a provider or model that the end user's or operator's location excludes;
- treats a `null` as `false`, an absent field as allowed, or a missing receipt as a reason to assume;
- uses these fields to find the point just below a limit or the edge of a rule.

## Compatibility and versioning

The [v1 rules](api.md#what-apiv1-guarantees) apply unchanged: v1 only grows.

- **All new keys are optional.** A 2.16.0 consumer that ignores unknown keys is unaffected. No existing field changes name, type or meaning. In particular `free_limits` stays an object; `applies_per` and `reset` are new keys inside it, as `per_model` is in #774.
- **Canonical schema.** `data/schema.json` stays closed (`additionalProperties: false`), so the implementation PR declares every new key there: `free_limits.applies_per`, `free_limits.reset`, `auth`, `availability`, `key_sharing_forbidden` (if adopted), and the new `field_checks` keys `limits_applies_per`, `limits_reset`, `auth_env_var`, `auth_header`, `availability_regions`, `availability_kyc`, `availability_min_age`, `key_sharing_forbidden`.
- **Published schemas.** `/api/v1/schema.json` is generated open (`additionalProperties: true`, since 2.15.0), so a strict validator with a current copy accepts the new keys. A copy fetched before 2.15.0 rejects them, as it already rejects `field_checks`; the changelog says so again.
- **`models.schema.json` and `status.schema.json`** gain the copied terms flags as optional properties. They are emitted on every row but not listed in `required`, so an older file still validates against the newer schema. `schema_version` of `status.json` stays `1`.
- **`free_limits` with no numbers.** Today `free_limits` is `null` when the provider publishes no numbers. 2.17.0 does not change that: `applies_per` and `reset` are recorded only when there are numbers to qualify. Whether a provider that states “limits apply per organization” without numbers should get a number-less `free_limits` object is [open question 3](#open-questions).
- **CSV.** `key_sharing_forbidden` (if adopted) becomes a column after `limit_circumvention_forbidden`, as the terms flags are. `auth`, `availability` and the new `free_limits` keys are nested and are not CSV columns, like `free_limits` today.
- **Generated client configs.** `openai-clients.json` and `litellm.yaml` keep using `env_key`. Switching them to `auth.env_var` would change their contents for providers where the two differ (OpenRouter above), so it is left for later.
- **Coverage and score.** `/coverage/` and `/quality/` keep counting the four production flags; the score does not use any new field. The new checks enter `status.json`'s `oldest_field_check`, so an old reading of a router field makes an entry older, as it should.
- **Merge order.** The implementation depends on #774 (`free_limits.per_model`, `models.json`) and #933 (terms flags). It must not merge before v2.16.0 is released. Dataset version: **2.17.0** (a minor bump; additive).
- **Wording to align.** #933's `docs/api.md` entry says a router “should treat `null` as unknown”. This contract makes the router rule stricter (`null` is forbidden by default); the data meaning (`null` = not recorded) does not change. The 2.17.0 PR updates that sentence so the two pages say the same thing.

## Validation rules to add

For the implementation PR, in `scripts/validate.mjs` and `scripts/lib/field-checks.mjs`:

1. Every recorded value of a new field has its receipt: a `stated` check with a `quote` that has its `field_sentence`, or (for `reset` and region rules) an entry `quote` registered under its new kind. A check without a value, or a value without a check, fails, as main's receipts rule already does for the flags.
2. `applies_per`: unique values from the enum, at least one.
3. `reset`: every unit is recorded in the same `free_limits` or a `per_model` entry, and appears in at most one entry; `timezone` is a valid IANA name, present exactly for `calendar_day` and `calendar_month`; `window_seconds` only with `rolling` or `fixed_window`.
4. `auth`: `env_var` and every alternative match `^[A-Z][A-Z0-9_]*$`; `header` is an RFC 9110 token; no field holds anything shaped like a key (a length and character-class check, as the secret scanning in `scripts/lib/key-hosts.mjs` already guards the other way). A warning, not an error, when `env_key` and `auth.env_var` are both set and differ.
5. Region rules: `countries` are upper-case ISO 3166-1 alpha-2 codes, unique, non-empty; a named group in the quote expands through the fixed table; `source` is on the provider's own site.
6. `kyc_condition` present and non-blank exactly when `kyc_required` is `"conditional"`; `min_age` within 13 to 21.
7. The copies in `models.json` and `status.json` equal the provider object's values (a build test, like the existing v1 projection tests).

## Open questions

1. **`project` as a value of `applies_per`.** Proposed because Google counts per project. Keep it, or fold it into `organization` and keep Paco's five values?
2. **Does a per-model table, or “different rate limits for different models”, establish `model`?** Proposed: no; `model` is listed only when a sentence says the counter is per model. Under this rule Groq is `["organization"]` although its table lists limits by model, and OpenRouter is `null`.
3. **`free_limits` without numbers.** Allow a number-less `free_limits` (only `applies_per` or `reset`, plus `source` and `checked`)? That changes what an object without numbers means today (“the provider publishes no numeric free limits” is `null`), so the proposal is no, and such a sentence goes in the note of `field_checks.limits_applies_per`.
4. **Per-model overrides.** Can a `per_model[]` entry carry its own `applies_per` or `reset`? Proposed: not in 2.17.0; no recorded page needs it yet.
5. **Code samples and code comments as quotes.** `auth` depends on code lines (`-H "Authorization: Bearer $GROQ_API_KEY"`), and OpenRouter's daily reset is stated in a code comment. Accept them as `quote`, with `quotes:add` extracting them from the page text? Proposed: yes for `auth_header` and `auth_env_var`; for other fields only when no prose sentence exists, with the note saying it is a code comment.
6. **One quote per check.** Some facts need two sentences (Gemini's variable names and their precedence). Keep one `quote` plus a `note`, or allow `quotes` (at most two) in the `field_check` shape? A shape change of `field_check` is additive but touches all six flags.
7. **OpenAI-compatible authentication.** Record a separate `auth.openai_compatible` header, or rely on OpenAI SDKs always sending `Authorization: Bearer`? Proposed: rely on the SDKs; record only when a provider documents something else.
8. **`min_age` and `kyc_required`.** Neither was in the approved list (which said “regions, KYC”); `min_age` is proposed because Gemini's terms set 18 and forbid applications likely to be used by minors, which a router serving the public needs to know. Keep, rename (`age_min`), or drop?
9. **Sublicensing and resale.** Google's API terms (4(a)(1)) forbid offering “an API Client that functions substantially the same as the APIs” to third parties, and OpenRouter's terms (7) forbid access “for purposes of reselling API access to Models”. These bear directly on whether a router may re-expose a provider at all, which matters more than any limit. Study a fifth terms flag (`resale_forbidden` or `sublicensing_forbidden`) for 2.18.0? This design does not answer it and does not tell any router that re-exposing a provider is allowed.
10. **`key_sharing_forbidden`.** Adopt in 2.17.0 with the narrow definition above (recommended), defer, or drop?
11. **Researching the 91+ providers.** The new fields need a research pass like #923. Ship 2.17.0 with the schema and the providers researched by then, with a shrink-only pending list (as #933's `TERMS_PENDING`), or wait for full coverage?
12. **Change feed.** Add the new fields to `HISTORY_FIELDS` so `changes.json` reports them? #933 leaves the same question open for its flags.

## Where the examples come from

All quotes were read on **2026-11-27** (UTC) on the provider's own pages.

- Read directly over HTTP from this environment, and matched word for word in the page text: <https://console.groq.com/docs/rate-limits>, <https://console.groq.com/docs/quickstart>, <https://console.groq.com/docs/legal/ai-policy>, <https://console.groq.com/docs/legal/services-agreement>, <https://ai.google.dev/gemini-api/docs/rate-limits>, <https://ai.google.dev/gemini-api/docs/api-key>, <https://ai.google.dev/gemini-api/terms>.
- Read through a page-extraction service, because this environment's network does not reach the host directly: <https://openrouter.ai/docs/api-reference/limits>, <https://openrouter.ai/docs/api-reference/authentication>, <https://openrouter.ai/terms>, <https://ai.google.dev/gemini-api/docs/available-regions>, <https://developers.google.com/terms>. These are not hash-checked; the 2.17.0 data PR must re-read them with `npm run quotes:add` (which records `page_sha256`) before any value enters `data/providers.json`.
- The terms-flag values of the three providers are #933's, whose quotes were re-read on 2026-11-26.

None of these values is in the dataset. They are design examples, and they will be read again when the data PR is written.

---

_[← Docs index](README.md) · [Static JSON API](api.md) · [Provider schema reference](schema.md)_
