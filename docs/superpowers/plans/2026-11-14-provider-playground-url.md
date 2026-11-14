# Provider Playground URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, sourced HTTPS `playground_url` and show a "Try it" button on provider pages when it is recorded.

**Architecture:** Extend the canonical provider schema and its explicit serializer key list; enforce HTTPS in JSON Schema and only the companion `docs_url` rule in the validator. Add one conditional link to the existing provider action block in `scripts/build.mjs`; the existing public-provider and API v1 projections already preserve new optional fields. Keep the documented CSV column contract unchanged in this issue.

**Tech Stack:** Node.js ESM (Node 22 from `.nvmrc`, package engine >=18), JSON Schema Draft 2020-12, Ajv 8 + ajv-formats, `node:test`, static HTML.

**Spec:** [GitHub issue #570](https://github.com/pacocartones/free-llm-api-hub/issues/570), refreshed 2026-11-14; the issue is the design/acceptance source, and this document records the implementation decisions. This is a plan-only artifact, not authorization to implement or publish.

## Global Constraints

- "an optional `playground_url` (string, an `https` URL), with a description."
- "nothing beyond the schema, plus: if `playground_url` is present, `docs_url` must be too."
- "Render a \"Try it\" button on `/p/<slug>` only when the field is set."
- "Fill it for up to five providers (fewer is fine if the others offer no playground)" using a provider-owned docs/console link to a no-code playground; do not guess URLs or log in to research candidates.
- "Write the page you read, and the date, in the PR description."
- Acceptance: `npm test` and `npm run check` pass; a build test proves present/absent links; a non-HTTPS URL fails validation.
- Use the existing locked dependencies and full Git history. No new dependencies, migrations, endpoint fetches in tests, or changes to provider slugs.
- This planning task changes only this file: no implementation, commit, issue comment, claim, PR, or other GitHub mutation.

## Review Focus

- Omitted versus explicit `null`/empty/incorrect-type values: omitted is valid and produces no button; invalid present values fail schema validation (Task 1).
- A syntactically valid HTTP or other non-HTTPS URI must fail for the new field (Task 1).
- An unverified provider with an empty/whitespace `docs_url` must not gain an apparently sourced playground (Task 2).
- A URL with query ampersands must survive serialization/API publication and be HTML-escaped in the action anchor (Tasks 1 and 3).
- A synthetic optional field must survive maintenance serialization and published API schema construction without appearing on an adjacent provider that omitted it (Tasks 1 and 3).

---

## Scope and file map

| File | Responsibility / exact edit |
| --- | --- |
| `data/schema.json` | `$defs.provider.properties.playground_url`: optional `type: "string"`, `format: "uri"`, `pattern: "^https://"`; description identifies a provider-owned no-code playground, unknown means omitted. Do not add it to `required`, allow `null`, or create a custom validator format. |
| `scripts/_serialize.mjs` | Append `'playground_url'` to exported `ORDER`, after `'data_policy'`, following its instruction that optional keys go at the logical tail. Preserve `serialize(data) -> string` and `roundTripError(raw) -> null \| string`. |
| `scripts/validate.mjs` | Inside the existing provider loop add only `if ('playground_url' in p)` plus a nonblank `docs_url` check. Existing schema already requires the property, so this specifically closes the empty-string exception for unverified rows. |
| `scripts/validate.test.mjs` | Reuse `structuredClone(DATA)`, `provider(data)`, `runValidate(data, report?, env?) -> {status, output, ...}`, and fixtures. Add named schema acceptance/rejection and companion-source cases. |
| `scripts/build.mjs` | Around `docsBtn`/`websiteBtn` (currently lines 1105–1138), add local `playgroundBtn: string`, and append it inside `<div class="prov-actions">`. Use `htmlEsc(p.playground_url)` and existing button classes. No new exported helper or stylesheet. |
| `scripts/build.test.mjs` | Add serializer regression and one private-tree integration test for actions, API payloads/schema, and absent values. Existing `ROOT = privateTree(REPO)`, `DATA`, `run(args)`, `htmlEsc`, and Ajv imports supply the harness. |
| `data/providers.json` | Add 1 verified public playground initially (`ocr-space`), or fewer if rechecking fails; any extra additions require the same evidence and keep the batch <=5. Update `generated` to the UTC day of the edit. |
| `docs/api.md` | Add the field under "Fields added within v1" and explicitly state that this issue does not extend the CSV projection. Do not change the enumerated CSV header. |
| `docs/comparison-dimensions.md` | Add the optional string field next to `docs_url`; omission means unrecorded, HTTPS only, docs required, conditional button. |
| `CHANGELOG.md` | Add one item under `[Unreleased]` / `### Added`; describe the additive field, conditional button, actual batch, and #570. |
| Generated outputs | Run the existing build; review/stage changed tracked targets and `derived-fingerprints.json` as described in Task 4. Never edit generated pages by hand. |

## Data evidence and candidates (read 2026-11-14 UTC)

Only one candidate currently meets the research gate; that is sufficient. No quota of five is required.

| Provider slug | Proposed `playground_url` | Provider-owned source opened | Evidence and scope |
| --- | --- | --- | --- |
| `ocr-space` | `https://ocr.space/` | [Free OCR API docs](https://ocr.space/ocrapi), plus [the destination form](https://ocr.space/) | The API docs' "Post Parameters" introduction links the online OCR form and says it calls the free OCR API for testing. The destination exposes upload/URL, language, engine, and start controls, and states free use without registration. This is the existing OCR provider; a chat-only playground is not required by the issue. No files were submitted and no inference was run. |

Research hold, **not approved data**: [Cloudflare's official Playwright MCP docs](https://developers.cloudflare.com/browser-run/playwright/playwright-mcp/) link [Cloudflare AI Playground](https://playground.ai.cloudflare.com/), but the destination returned no readable interface in the research tool. Ownership/linkage is evidenced; anonymous usability has not been established. Leave `cloudflare-workers-ai` unchanged unless an unauthenticated visit later confirms the actual no-code UI. The Workers code-editor playground is not a substitute. No Cerebras, Groq, Google, or other console URLs are approved by this plan.

For each eventual included row, record in the PR description: slug, exact destination, exact official source URL, UTC date the page was actually opened, a short supporting passage or precise link/control description, and any visible account/access restriction. Reopen sources during implementation; do not reuse the plan date as a fresh check. Leave failed, login-gated, or uncertain candidates omitted and report the limitation. Preserve the existing pricing/rate-limit `docs_url`: the playground evidence belongs in the PR description, not in a replacement pricing source or a newly invented data field. Do not bump `last_verified`, `verified`, `last_probed`, or `probe_status` for inspecting a playground alone. `AI_POLICY.md` makes AI disclosure optional; the issue asks for disclosure, so include a brief factual AI-assistance note in the eventual PR description, without co-author trailers.

### Task 1: Schema and lossless maintenance serialization

**Files:** Modify `data/schema.json`, `scripts/_serialize.mjs`; test `scripts/validate.test.mjs`, `scripts/build.test.mjs`.

**Interfaces:**
- Consumes existing provider objects and fixture-validator CLI (`node scripts/validate.mjs <providers-file> <report-file>`).
- Produces `Provider.playground_url?: string`; no new public functions. `ORDER`, `serialize(data) -> string`, and `roundTripError(raw) -> null | string` retain their signatures.

- [ ] **Step 1: Write failing tests.** In `validate.test.mjs`, name the tests `playground_url accepts HTTPS and remains optional` and `playground_url rejects invalid present values`. A cloned fixture with `https://example.com/playground?model=a&mode=b` and the normal `docs_url` must return `status === 0`; deleting the new key must also pass. For each value in `['http://example.com/playground', 'ftp://example.com/playground', 'javascript:alert(1)', '/playground', '', 'not a URI', null, 7, {}]`, assert `status !== 0` and `/providers/<index>/playground_url` in the schema diagnostic. In `build.test.mjs`, name `playground_url survives canonical serialization`: add the same valid URL only to provider 0 of a clone, `JSON.parse(serialize(data))`, assert strict equality of that value, and assert provider 1 has no own `playground_url` property.
- [ ] **Step 2: Run the new tests before implementation.** Run `node --test --test-name-pattern=playground_url scripts/validate.test.mjs scripts/build.test.mjs`. Expected RED: HTTPS acceptance fails because the property is undeclared; serialization loses the key. Invalid-value rejection alone is not sufficient red evidence: it already fails as an unknown property before this feature.
- [ ] **Step 3: Implement the exact schema property and append the serializer key described in the file map.** Do not add URL parsing, HTTP fetching, ownership allowlists, null support, or extra checks to `validate.mjs` for this type rule.
- [ ] **Step 4: Rerun the focused command.** Expected GREEN for both new tests and all invalid cases. Run `node --test --test-name-pattern='serializer ORDER|serializer round-trips' scripts/build.test.mjs`; expect both existing schema/key-order and byte-roundtrip tests to pass.
- [ ] **Step 5: Review the diff.** Confirm only the schema, serializer and their tests changed in this task. Any later commit requires separate execution authorization; this plan itself makes no commit.

### Task 2: Companion primary source rule

**Files:** Modify `scripts/validate.mjs`; test `scripts/validate.test.mjs`.

**Interfaces:**
- Consumes `Provider.playground_url?: string` from Task 1 and existing `Provider.docs_url: string`.
- Produces the integrity diagnostic `<slug>: playground_url requires a non-empty docs_url` through existing `check(cond, msg) -> void`; validator continues to exit 1 on failed integrity rules.

- [ ] **Step 1: Write `playground_url requires non-empty docs_url on unverified rows`.** Start from a valid clone, select one provider, set `verified = false`, `last_verified = null`, and `playground_url = 'https://example.com/playground'`. For `docs_url = ''` and `docs_url = '   '`, assert nonzero exit and the exact new diagnostic. Delete `docs_url` in a separate clone and assert a schema missing-required-property diagnostic. Assert the unverified row with a normal HTTPS `docs_url` passes; an omitted playground with empty docs remains accepted under existing rules.
- [ ] **Step 2: Run `node --test --test-name-pattern=playground_url scripts/validate.test.mjs`.** Expected RED specifically because a present playground plus empty docs currently succeeds (or lacks the required diagnostic), after Task 1 has made the property legal. Do not accept a stale unknown-property failure as red evidence.
- [ ] **Step 3: Add only the companion-source condition inside the provider loop:** when `'playground_url' in p`, call `check(typeof p.docs_url === 'string' && p.docs_url.trim().length > 0, `${id}: playground_url requires a non-empty docs_url`)`. Missing/type-invalid docs remain schema failures. Do not add source/date fields or broaden existing verified-provider rules.
- [ ] **Step 4: Rerun the focused command, then `node --test scripts/validate.test.mjs`.** Expected GREEN, including the control without a playground.
- [ ] **Step 5: Review the diff** for the single new integrity rule and its focused tests.

### Task 3: Conditional provider action and additive API coverage

**Files:** Modify `scripts/build.mjs`; test `scripts/build.test.mjs`.

**Interfaces:**
- Consumes `Provider.playground_url?: string`, `htmlEsc(value) -> string`, existing private-tree build CLI and `toApiV1Provider(provider) -> provider`.
- Produces local `playgroundBtn: string`: `<a class="btn" href="<escaped URL>" target="_blank" rel="noopener">Try it ↗</a>` when set, otherwise `''`; append after `${docsBtn}${websiteBtn}`. Existing action buttons and page structure remain intact.
- API payloads keep `playground_url` unchanged when present, omit it when absent; published `$defs.provider.properties.playground_url` copies the new schema automatically. Do not edit `scripts/lib/api-v1.mjs`.

- [ ] **Step 1: Write `provider playground action is conditional and preserved in public JSON`.** In the existing private `ROOT`, save the raw `DATA`, clone it, pick two distinct providers, set only the first to `https://example.com/playground?model=a&mode=b`, and explicitly delete the second's field. Write using `serialize(data)` and run `run(['scripts/build.mjs'])`. Read `site/p/<first.slug>.html` and assert exactly one `Try it ↗` action with `href="https://example.com/playground?model=a&amp;mode=b"`, `class="btn"`, `target="_blank"`, `rel="noopener"`; assert the original docs/website actions remain. Read `site/p/<second.slug>.html` and assert no `Try it` action. Inspect `site/providers.json` and `site/api/v1/providers.json`: first row retains the original unescaped string; second has no own field. Inspect `site/api/v1/schema.json`: assert `type`, `format`, and `pattern` match Task 1, and use the existing Ajv setup to validate the published provider payload. Use `finally` to restore raw `DATA` and rebuild, so later tests in this shared private tree receive original fixtures even on failure. No writes to the actual checkout's dataset or site.
- [ ] **Step 2: Run `node --test --test-name-pattern='provider playground action' scripts/build.test.mjs`.** Expected RED on missing `Try it` markup; serialized/API data already survive after Task 1.
- [ ] **Step 3: Add the local conditional anchor and interpolation** in the existing action block, using the exact interface above. Reuse `htmlEsc`; no CSS, helper module, endpoint probing, client-side UI or display outside provider pages.
- [ ] **Step 4: Rerun the focused command.** Expected GREEN for present/absent, query escaping, companion actions and API/schema assertions. Then run `node --test scripts/build.test.mjs`; expect GREEN, including idempotency and source-tree isolation.
- [ ] **Step 5: Review the source diff and generated private fixture output.** Check the three actions fit the existing responsive/wrapping action block. Do not commit private-tree artifacts.

### Task 4: Evidence-backed seed, documentation and generated output

**Files:** Modify `data/providers.json`, `docs/api.md`, `docs/comparison-dimensions.md`, `CHANGELOG.md`; regenerate existing tracked artifacts and `derived-fingerprints.json` with the build.

**Interfaces:**
- Consumes the tested optional field and evidence gate above; produces 0–5 sourced provider values, updated field docs and generated output.
- This task changes factual data/prose, not behavior; use the preceding red/green regression tests and the real build checks, rather than contrived prose snapshot tests.

- [ ] **Step 1: Reopen the OCR.space official source and destination anonymously.** Record the actual UTC date and visible support in a PR evidence table. If the free form no longer appears or the source no longer connects it to the provider's API, omit it and report the limitation. Do not log in, submit content, create accounts, or guess alternatives. Additional providers are optional, maximum total five, and each must independently pass this same gate.
- [ ] **Step 2: Add only approved values, serialize canonically, and update `generated`.** Initially this is `ocr-space.playground_url = 'https://ocr.space/'`; preserve existing core verification and probe timestamps. Follow `RELEASING.md`: this issue is unreleased additive work; leave dataset/package versions and tags unchanged rather than triggering a release. The changelog's general shape-change wording and release-cadence rules overlap: document this as an additive field for the next minor release, without inventing a new release number.
- [ ] **Step 3: Add the required docs/changelog entries.** API text says `playground_url` is optional HTTPS string, additive within v1, no new required property, omitted means unrecorded, and CSV remains the explicitly documented existing projection. Comparison dimensions names the no-code destination, source requirement and conditional "Try it" action. Changelog under `[Unreleased]` names the field, actual included providers, and #570. Do not imply an anonymous playground exists for every provider or equate playground availability to API free-tier limits.
- [ ] **Step 4: Run `npm run build`, then `npm test`.** Expected validation and internal-link success plus the complete `scripts/*.test.mjs` suite passing. Inspect actual errors; do not weaken tests to mask unrelated Windows/environment failures. The Windows portability plan in this checkout is a separate change; report any reproduced blocker explicitly.
- [ ] **Step 5: Inspect generated changes with `git status --short` and `git diff --stat`.** Expected affected surfaces include tracked `site/providers.json`/embedded homepage data, `site/providers.csv` metadata if `generated` changes, `CITATION.cff`, sitemap/date-bearing output, and `derived-fingerprints.json`. The build also writes gitignored `site/p/*.html`, `site/api/v1/providers.json`, provider slices, and `site/api/v1/schema.json`; inspect them, but do not force-add ignored files. `scripts/generated-targets.mjs` determines tracked drift targets; never hand-edit the fingerprint or assume every generated file is committed. Run `npm run og` only if the existing OG check flags relevant drift.
- [ ] **Step 6: Verify final drift correctly.** `npm run check` runs validate, build, then `git diff --exit-code` for generated targets: unstaged intentional generated changes fail this gate. During a separately authorized implementation, stage the intended reviewed source and generated changes (or commit them if authorized), then run `npm run check` and expect `Generated files are in sync.` Check staged content also with `git diff --cached --stat` and `git diff --cached --check`. Do not claim a pass from an unexecuted command; this planning task stages nothing.
- [ ] **Step 7: Prepare handoff evidence.** Report commands and actual results, included-provider source/destination/date table, limitations, and AI assistance. No issue claim, PR creation, push, merge, release, or other remote mutation is part of this plan-only request.

## Non-goals and risks

- No new providers, five-entry quota, automatic playground discovery, login/account access, inference requests, SDK samples, API endpoints, CSV-column expansion, explorer filters/columns, ranking/scoring changes, comparison UI, source-register schema, or history-field expansion.
- HTTPS and URI checks are a schema contract, not proof of ownership/access: human source verification controls the seed batch. Do not add broader public-host policy checks that #570 excludes.
- Playground pages and free access can change independently of API quotas. Recheck the source before data entry and disclose uncertainty without changing unrelated facts.
- Serializer `ORDER` is exhaustive: missing the added key silently deletes optional data during maintenance and fails the existing schema/order regression. Keep the Task 1 tests.
- Generated provider HTML is ignored/date-relative; a hand-checked page alone cannot replace the build regression. Generated drift checks compare the index/HEAD state as described above.
- Plan self-review: all five issue tasks map to Tasks 1–4; all five Review Focus conditions have named assertions; function names/types match existing code; only this plan is written during planning.
