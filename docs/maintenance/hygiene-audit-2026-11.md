# Hygiene audit, November 2026

A read-and-measure pass over the code, tests, docs and CI after about 70 pull requests landed in two days (v2.14.2, `main` at 5af5ef7, 2026-11-26). It records findings only. Fixes go out as small pull requests that preserve behaviour; this document says which finding each one covers.

**Status: closed (2026-11-26).** Every finding is now fixed (with its pull request number), confirmed as needing no change, or deferred with a reason. [Status of every finding](#status-of-every-finding) at the end is the index. Line numbers in the findings still refer to 5af5ef7.

**Method.** I used Node 24.22.3 on a full clone. `npm ci --ignore-scripts`, `npm run build`, `npm test`, `npm run check` and the Lighthouse accessibility/SEO gate (`node scripts/lighthouse-gate.mjs --mode=accessibility-seo` against local Chromium) all ran and passed on `main`:

- 1257 tests, 0 failures.
- `check` reported the generated files in sync.
- All 21 pages scored accessibility 1 and SEO 1.

Unused exports and orphaned CSS were found by scripts and then confirmed by hand with `git grep`. Every "byte-identical" claim below was checked by reading both copies. Line numbers refer to 5af5ef7.

**Areas left alone on purpose.** These are listed under [Deferred](#deferred-areas-in-flight), not changed: the brand stack (#844–#847: `site/styles.css`, home and provider templates, OG), the SEO/AEO work on provider-page JSON-LD and FAQ, and the structured-data fixes (#904, JSON-LD builders). Files that other open pull requests edit (#774, #775, #815, #896, #903) were also avoided where a change would conflict.

## Summary: top 10 by impact × safety

| # | Finding | Impact | Risk of fix | Status |
|---|---|---|---|---|
| 1 | Contributor docs still say "commit the regenerated files" and "run `npm run check`". In push mode the first is blocked and the second fails for a correct pull request. | High | Low (docs) | Fixed in #906 |
| 2 | `npm run check` does not know about the regeneration mode. It is the strict gate, which CI uses only outside push mode. | High | Medium | Fixed in #935 |
| 3 | The same helpers are copied across `scripts/lib`: `safeHttp` ×5, `safeUrl` ×3, `plural` ×6. | Medium | Low | Fixed in #905 (10 of 14 copies) |
| 4 | There are seven HTML escapers. `esc` means a GFM-cell escaper in `escape.mjs` and an HTML escaper elsewhere. | Medium | Medium | Fixed in #920 |
| 5 | Dead script `scripts/generate-gfis.mjs` would rewrite live issues #7 and #8 if run. | Medium | None | Fixed in #907 |
| 6 | No CI job caches npm, and Lighthouse installs a heavy locked toolchain twice per run. | Medium | Low | Fixed in #921 |
| 7 | In push mode, `verify.yml` builds twice in one job. A merge builds the same commit in verify, regenerate and pages. | Medium | Medium | Fixed in #921 (one build per job). #935 drops the preview's build and Verify's re-run on the bot's commit. |
| 8 | `regenerate-preview.yml` duplicates the push-mode drift gate and still describes a "planned" gate. | Medium | Low (wording) / Medium (removal) | Fixed in #935 (removed and folded into Verify) |
| 9 | Lighthouse performance (21 pages × 3 runs) runs on every push to `main`, docs-only merges included, and again every night. | Low–Medium | Low | Fixed in #921 |
| 10 | Unknown values are shown four ways: "unknown", "not confirmed", "—", "not recorded". Dates use three formats. | Low | Low–Medium (output changes) | In progress in a separate pull request |

## 1. Duplication

### D1. `safeHttp`, `safeUrl` and `plural`: done in #905
- `safeHttp` (`/^https?:\/\//i` test, otherwise `''`) was copied identically in:
  - `lib/coverage.mjs:53`
  - `lib/data-policy-page.mjs:11`
  - `lib/free-coding-tools.mjs:11`
  - `lib/free-gpu.mjs:11`
  - inline in `lib/compare.mjs:164`
- `safeUrl` (the same test, then `htmlEsc`) was in `lib/best-facts.mjs:7`, `lib/model-pages.mjs:37` and `lib/provider-sections.mjs:34`.
- `plural` was in `lib/changes.mjs:108`, `lib/state.mjs:111`, `lib/home-first-use.mjs:36`, `monthly-issues.mjs:76`, `lib/long-guides.mjs:174` and `lib/model-pages.mjs:53`. The last two have a defaulted `many`, which covers every other call.
- **Fix:** #905 adds `scripts/lib/text.mjs` and imports it in 10 modules. The site is byte-identical.
- **Left:**
  - `compare.mjs`: its source is shipped to the browser by `clientBundle()`, so it cannot import.
  - `changes.mjs` and `provider-sections.mjs`: #774, #815 and #775 edit them. Move them to `text.mjs` once those merge.
  - `scripts/text.test.mjs` pins the list of remaining copies.

### D2. The issue-URL builder for "inaccuracy" issues
- **Copies:** `lib/changes.mjs:133` (`reportChangeUrl`, title `[outdated] …`), `lib/coverage.mjs:50` (`[coverage] …`) and `lib/data-policy-page.mjs:65` (`[data policy] …`). Only the title prefix differs.
- **Related:** `build.mjs:2295` `issueForm`, and hand-written `issues/new?template=` links in `lib/free-coding-tools.mjs:143` and `monthly-issues.mjs:120,176`.
- **Fix:** one `inaccuracyIssueUrl(repo, slug, title)` that the named exports wrap.
- **Risk:** low.
- **Note:** `reportChangeUrl` is dead (see X2). Remove it rather than wrapping it, once #774 merges (that PR inserts lines right after it).

### D3. Seven HTML escapers
- **Same behaviour** (`& < > "`, null becomes `''`):
  - `build.mjs:504` `htmlEsc`, about 100 uses
  - `lib/find-page.mjs:16` `esc`
  - `lib/long-guides.mjs:152` `esc`, exported but imported by nothing
- **Different behaviour, leave as they are:**
  - `lib/rows.mjs:18` `htmlEsc` also escapes `'`. Its source is shipped to the browser.
  - `lib/markdown.mjs:10` `escHtml` turns null into `'null'`.
  - `lib/badge-svg.mjs:32` and `lib/og.mjs:29` (OG, deferred) have no null handling, and `og` does not escape quotes.
  - `lib/changes.mjs:94` `xmlEsc` uses `&apos;` and strips control characters.
  - `lib/quickstart.mjs:26` escapes three characters only.
- **Hazard:** `escape.mjs:11` exports a different `esc`, the GFM table-cell escaper. The same name means two things.
- **Fix:** export the four-character escaper from `escape.mjs` as `htmlText`, and import it in `build.mjs`, `find-page.mjs` and `long-guides.mjs`.
- **Risk:** medium.
  - `api-copy.test.mjs:9` reads the `const htmlEsc =` line of `build.mjs` as text and evaluates it, so that test has to change with it.
  - `build.mjs` and `find-page.mjs` are edited by most open pull requests (#904 included), so wait for them.

### D4. Repeated fragments in the guide and collection generators in `build.mjs`
- **FAQ item markup:** byte-identical at `build.mjs:1028`, `1792` and `1843`. `1126` differs: it escapes the answer.
- **"More guides" links:** `1789–1790` and `1844`.
- **"Looking for OpenAI…" sentence:** `1808` and `1852`.
- **Guides & Collections breadcrumb prefix:** `1073`, `1795` and `1846`.
- **`IC`** at `build.mjs:573` is byte-identical to `ICON` in `lib/rows.mjs:25`.
- **`<urlset>` wrapper:** appears twice at `build.mjs:2672–2683`. `lib/state-sitemap.mjs` already has `sitemapIndexXml`.
- **Hero:** `lib/model-pages.mjs:129–130` writes out by hand the same bytes `pageHero()` (`build.mjs:578`) produces.
- **Fix:** move `pageHero` into `lib/page-hero.mjs` (keep the injected parameter that `find.test.mjs:303` stubs) and add `faqItemsHtml()`, `moreGuidesHtml()` and `urlsetXml()` helpers.
- **Risk:** low for the output, but `build.mjs` is a conflict hotspot. Do it after the brand, SEO and structured-data pull requests merge.

### D5. Site and repository constants
- **`'https://freellmapihub.com'`** is defined in five places: `build.mjs:159`, `lib/indexnow.mjs:13`, `lib/published-speed.mjs:145`, `monthly-issues.mjs:21` and `check-sitemap-live.mjs:27`.
- **The repo slug or URL** is defined in five places: `build.mjs:542`, `monthly-issues.mjs:19`, `contributors.mjs:19`, `refresh-stars.mjs:16` and the now-removed `generate-gfis.mjs`. It is also hard-coded in `lib/not-free.mjs:180` and `lib/source-watch.mjs:157`.
- **Fix:** export `SITE_ORIGIN` and `REPO_URL` from `lib/site-entity.mjs`.
- **Risk:** low. `site-entity.mjs` is in #904, so wait for it.

### D6. Dates
- `lib/release-stamp.mjs:15` `utcToday()` exists, yet `new Date().toISOString().slice(0, 10)` is repeated in `add-provider.mjs:91`, `validate.mjs:90`, `probe.mjs:39`, `quotes-add.mjs:52`, `discover.mjs:140`, `fetch-models.mjs:284`, `refresh-stars.mjs:43`, `reverify.mjs:67` and `lib/quotes.mjs:29`.
- Local `ymd`, `iso` and `DAY` helpers appear in `lib/changes.mjs:11–12`, `lib/freshness-histogram.mjs:17,22` and `lib/quality.mjs:18,20`.
- `ageInDays` (`lib/rules.mjs:87`) is written out again inline at `build.mjs:936`.
- **Fix:** a `lib/dates.mjs` with `utcToday`, `isoDay`, `ageInDays`, `shortDate` and `monthLabel`.
- **Risk:** low, but the payoff is low too.

### D7. Near-identical page generators
- `lib/free-gpu.mjs` and `lib/free-coding-tools.mjs`: `quoteHtml` differs only in `“` against `&ldquo;`, and `claimHtml` only in its status wording.
- `lib/gpu-compute.mjs:12` and `lib/coding-tools.mjs:17` `quoteErrors`: the coding-tools version adds a hidden-character check.
- **Fix:** shared, parameterised builders.
- **Risk:** medium. The bytes differ, so the pull request would have to show the `site/` diff.
- **Not duplicated:** the page shell is built in one place (`htmlPageRaw`, `build.mjs:664`), `redirectPage` has one definition (`build.mjs:1160`), and every `lib/*-page.mjs` returns only `<main>` content.

### D8. Test helpers
- **`read`:** `const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')` is repeated in `dataset-mirrors`, `home-density`, `llms-markdown`, `long-guides`, `quality` and `use-data-pages`, with five more variants. 42 test files define their own `ROOT`.
- **Git environment:** `changelog-draft.test.mjs:11–17` and `history.test.mjs:12–18` copy the same "Fixture" author/committer block.
- **`ourWords` and `dpOurWords`:** `ourWords` (`coding-tools.test.mjs:37`) and `dpOurWords` (`build.test.mjs:3010`) share a core.
- **Fix:** add `ROOT`, `readRepo()` and `fixtureGitEnv()` to `lib/test-tools.mjs`.
- **Risk:** low (tests only). Value: low.

## 2. Dead code and stale material

| ID | What | Evidence | Fix | Risk | Status |
|---|---|---|---|---|---|
| X1 | `scripts/generate-gfis.mjs` | No references (only CHANGELOG). With `--sync` it would retitle #7/#8 from today's counts (56 null `phone_required` vs 45 in the title). | Delete | None | #907 |
| X2 | `lib/changes.mjs:129–134` `reportChangeUrl` | Its button was removed in 33d8541 (#496). Only `build.test.mjs:21,1485` uses it. | Delete with its test | None | Deferred: #774 inserts right after it |
| X3 | `lib/model-tier.mjs:15` `MODEL_TIER_ATTRIBUTION` | Used nowhere | Delete | None | #907 |
| X4 | `assets/logo-full.svg` | Not referenced on `main` | Delete | None | No change: since the brand stack (#844–#847), `scripts/icons.mjs` writes it and `aura.test.mjs` pins it |
| X5 | Dormant event banner: `site/site.js:145–151`, `styles.css:883–886`, `build.test.mjs:3410–3451` | No banner is configured. The test asserts there is none on the home page and still exercises the mechanism. | Delete all three if no campaign is planned | Low; changes the bytes of `site.js` | Owner decision; deferred. The brand stack has merged, so only that decision remains. |
| X6 | 76 exports used only inside their own file (13 in `long-guides.mjs`, 6 in `find.mjs`, 4 in `check-sources.mjs`, …) | Export scan | Drop `export` during other edits; cosmetic | None | Not planned as its own change |
| X7 | `package.json` `comment` says the drift-target list "must stay in sync" with verify.yml | Both read `scripts/generated-targets.mjs` now | Correct the comment | None | #907 |
| X8 | `docs/live-testing.md:92` and `docs/backlog.md:9`: "uncomment the publish step" of `probe-cron.sh` | The script has no such step and says it never publishes | Drop the phrase | None | #907 (live-testing), #935 (backlog) |
| X9 | `lib/not-free.mjs:6` names `scripts/not-free.test.mjs` | Does not exist; the test is `use-data-pages.test.mjs` | Fix the comment | None | #935 |
| X10 | `lib/regenerate.mjs:119–124` | `startsRegeneration` repeats the `REGENERATE_INPUTS` path list by hand | Build one from the other | Low | #935 |

**Checked and kept.**
- `speedTldrRow` (`lib/published-speed.mjs:153`) is only called from tests, but `published-speed.test.mjs:200` uses it to require that the README TL;DR row matches the data. It is a guard, not dead code.
- `probe-cron.sh` runs on a VPS and is documented.
- `site/fonts/OFL.txt` and the Search Console file are required.
- The test-only exports in `private-tree.mjs`, `tmp.mjs`, `test-tools.mjs` and `tracked-files.mjs` are deliberate.

### Orphaned CSS in `site/styles.css`: deleted in #935, except the event banner
None of these selectors appears in a generator, client script or built page. #935 re-checked each one after the Cálida brand merged, against every built page (the gitignored `/p/` pages included), every generator and client script, and every `classList` call. It then deleted all of them except `.event-banner*`, which waits for the X5 decision. `.ver-date` turned up as a new orphan: the brand stack removed its last use.

| Line | Selector |
|---|---|
| 91 | `.mono` (in the `h1, h2, h3, .mono` rule) |
| 112 | `.logo-mark.lg` |
| 113, 228 | `.hero-logo`, `.hero-logo:hover`, `.foot-logo:hover` |
| 434–435 | `.row-actions`, `a.docs-link` |
| 479 | `.best-wrap` (`build.test.mjs:407` asserts it is absent) |
| 504–509 | `.best-tag` |
| 643–644 | `.model-search` |
| 650–651 | `.hero-links`, `.hl-label` |
| 698 | `.footer-bottom .foot-logo .logo-mark` |
| 883–886 | `.event-banner*` |

- **Built dynamically, so in use:** `.best-podium-N`, `.best-req-unknown` and `.find-flag.is-*`.
- `site/tables.css` has no orphans.

## 3. Inconsistencies

### I1. Regeneration guidance (finding 1): done in #906
`.github/regen-mode` says `push`, and CONTRIBUTING's "For provider data, edit the source" section is right. These places still said to commit regenerated files and run `npm run check`:
- `README.md:238`
- `CONTRIBUTING.md:81, 110, 118, 124`
- `docs/tutorial-first-provider.md:132, 165, 169–183, 204`. It said "the regeneration bot is not live".
- `docs/update-playbook.md:80–90`
- `docs/regeneration-bot.md:15, 30`
- `docs/architecture.md:30, 36`

I reproduced the problem in a scratch worktree with a one-field data commit and a build. `regenerate-guard.mjs drift-gate` gave `bot-would-regenerate` with exit 0, so CI passes. `check-generated.mjs` exited 1. #906 rewrites each place push-mode first and keeps the other-mode text for a rollback.

**Left after #906:**
- `CONTRIBUTING.md:42` and `.github/PULL_REQUEST_TEMPLATE.md` described the preview run. #935 rewrote them with C2.
- Deferred: `npm run sync-main` rebuilds and commits generated files on a merge conflict. In push mode that commits derived files the gate then judges. Medium risk; needs a code change.

### I2. How an unknown value is shown
- **"unknown":** `yn()` in `build.mjs:2143–2144` writes "unknown" for gates in llms.txt.
- **"not confirmed":** the same block at `2150–2151`, `lib/provider-markdown.mjs:120–124` and `lib/field-checks.mjs:35`. This matches the stated policy at `lib/find-page.mjs:57`.
- **"—":** `build.mjs:1570, 1729, 2167`, `lib/compare.mjs:167–197`, `lib/coverage.mjs:63` and `lib/quality.mjs:139`.
- **"not recorded":** `lib/provider-sections.mjs:93`, `lib/model-pages.mjs:104` and `lib/provider-markdown.mjs:183`.
- **Other forms:** "not specified" for rate limits and "?" for flag marks (`lib/flags.mjs:31`). llms.txt also defaults missing modalities to `['text']`.
- **Fix:** "not confirmed" for tri-state facts and "—" for empty table cells, exported as constants.
- **Risk:** low to medium. The output changes, so the pull request would show the `site/` diff. Parts of it touch provider pages, so it is deferred.

### I3. Date formats
- **ISO** on cards, compare and the README: `build.mjs:136, 527, 1258` and `lib/compare.mjs:199`.
- **`26 Nov 2026`** in meta descriptions: `lib/provider-meta.mjs:9–16`.
- **`November 2026` and `Nov 2026`:** `lib/state.mjs:106–108` and a second month table at `build.mjs:86`.
- **Provider prose** in `data/providers.json` mixes "November 26, 2026" (10 times) and "26 November 2026" (4 times).
- **Fix:** D6's `lib/dates.mjs`, plus a style note or validator rule for prose dates.

### I4. "76 verified" and "77 providers"
- **The numbers are both correct:** 77 providers, 76 of them `verified: true`. Poolside is the one that is not.
- **But the home page reads oddly:**
  - The title says "76 verified free tiers & credits" (`build.mjs:952`).
  - The first paragraph says "77 … 36 ongoing free tiers and 41 trial credits" (`lib/home-first-use.mjs:63`). 36 + 41 = 77.
- **The verified count is computed in five places:** `lib/figures.mjs:11`, `build.mjs:104` (`verifiedCount`, which duplicates `FIGS.verified`), `build.mjs:952`, `lib/embed-page.mjs:45` and `dataset-mirrors.mjs:80`. They agree only because `validate.mjs` forces `verified` to be a boolean paired with `last_verified`.
- **Fix:** use `providerFigures()` everywhere, and write "77 … (76 verified)" the way `find-page.mjs:57` does.
- **Status:** deferred, because the home template belongs to the brand stack.

### I5. Analytics: one mechanism, with constants copied by hand
- There are no `data-ga` attributes or inline `gtag` calls. Everything goes through `lib/consent.client.js`, whose delegated `track()` is injected by `lib/analytics.mjs`.
- `consent.client.js:231–246` hard-codes copies of the explorer chip IDs, `SORT_KEYS`, `WIZARD_USES` and `WIZARD_FILTERS`. These can drift from `lib/find.mjs` and `lib/sort.mjs`.
- **Fix:** have the build inject them, the same way it substitutes `__GA_MEASUREMENT_ID__`.
- **Risk:** low.

### I6. Naming
- **Escapers:** see D3.
- **Generator naming:** page generators mostly use a `*MainHtml` suffix, with exceptions `longGuidePage`, `buildReport` (defined in both `quotes-report.mjs` and `source-watch.mjs`) and `renderIssue`.
- **File names:** `*-page.mjs` (data-policy, embed, find) sits next to `model-pages.mjs`, `free-gpu.mjs` and `quality.mjs`.
- **Confusing pairs:** `free-coding-tools`/`coding-tools` and `free-gpu`/`gpu-compute` (data validation vs page).
- **Fix:** renames only when a file is edited for another reason.
- **Risk:** medium, because of churn and conflicts.

### I7. Doc drift, smaller
- `CONTRIBUTING.md:240` names MCP tests on Node 22 and 24, but `mcp-ci.yml` runs 22, 24 and 26. `release-mcp.yml:62` tests on 22 only.
- `docs/live-testing.md:43` says "Node.js 20.6 or later". That is true for `--env-file`, but the repo requires 24.

### I8. Test style
- All 98 test files use `node:assert/strict`.
- 72 import `{ test }` and 11 use the default import.
- Only 7 use `describe`.
- Consistent enough; no churn proposed.

## 4. Weight

### Files

| File | Lines | Note |
|---|---|---|
| `scripts/build.test.mjs` | 3550 | One file holds most of the build assertions. Splitting it by page family would make failures easier to find and allow more parallelism. |
| `scripts/build.mjs` | 2757 | 46 sections and 65 top-level functions. The 20-plus page sections are candidates to move into `lib/*-page.mjs` the way find, embed and not-free already did. |
| `scripts/lib/long-guides.mjs` | 1600 | Editorial guides. `productionGuide` alone is 158 lines. |
| `scripts/validate.test.mjs` / `validate.mjs` | 605 / 406 | |

The largest functions are `long-guides.mjs:425` `productionGuide` (158 lines), `sync-main.mjs:52` `syncMain` (139), `dataset-mirrors.mjs:74` `mirrorFiles` (128), `long-guides.mjs:1318` `agentsGuide` (90), `quality.mjs:36` `quality` (88), `quotes.mjs:29` `quoteErrors` (87) and `staleness.mjs:22` `stalenessWorklist` (87).

### CSS and client code
- **`site/styles.css`:** 78,553 bytes, 1,036 lines, 739 rule blocks, 38 ID selectors and 2 `!important`. About 13 orphaned selectors are listed above.
- **`site/tables.css`:** 3,348 bytes.
- **The largest client scripts:** `explorer.js` (22 KB), `shared-find.js` (12 KB), `find.js` (8.7 KB) and `shared-compare.js` (8 KB).
- The redesign owns `styles.css`, so measuring specificity and pruning are deferred to it.

### Build time
- **Total:** `npm run build` takes 0.77 s wall time (1.3 s of CPU samples under `--cpu-prof`) and writes about 750 files (17 MB, of which `site/og/` is 8 MB).
- **Where the time goes:**
  - File writes: `writeFileUtf8`, 278 ms
  - Spawning git for history: `spawnSync`, 110 ms
  - Directory resets: `rmSync`, 100 ms
  - `mkdir`: 74 ms
  - History parsing: `lib/history.mjs`, 105 ms
  - Page rendering in `build.mjs` and libs: under 200 ms in total
- **Conclusion:** the build is I/O-bound and already fast. There is nothing to optimise, except perhaps not deleting and rewriting unchanged directories (`build.mjs:1009–2612` resets 12 directories on every run).

### Test suite
- **Total:** 1257 tests in 98 files, 72–87 s wall time on 4 cores (user 2 m 18 s, sys 53 s).
- **What makes it slow:** subprocesses.
  - 30 test files spawn `build.mjs`, about 72 call sites.
  - Several spawn `validate.mjs` once per case.
- **Slowest tests:**
  - `validate rejects line-breaking and hidden characters in client-config metadata`: 4.9 s
  - `data_policy: the sentence and its note are plain text…`: 4.6 s
  - `build removes retired tools, guides and collections…`: 3.4 s
  - `anonymous_access: the validator accepts…`: 3.4 s
  - `agreement with the explorer`: 3.0 s
- **Proposal T1:** the per-case `validate.mjs` subprocesses could call an exported `validateData()` in-process. Several 2–5 s tests would drop to milliseconds.
  - **Risk:** low to medium. The subprocess form also tests the CLI exit code, so keep one CLI test per rule family.
- **Proposal T2:** build tests that each copy the repository and build could share one fixture build per file.
  - **Risk:** medium, because of the test isolation they currently get.
- **The suite needs a full clone.** On the shallow clone the cloud session started with, 2 tests fail (`/changes/` table, Groq history). That is expected and documented in CONTRIBUTING, but the failure message could name `git fetch --unshallow` directly.

## 5. CI

| ID | Finding | Evidence | Fix | Risk |
|---|---|---|---|---|
| C1 | `npm run check` is the strict gate, which is wrong in push mode (finding 2) | `package.json` `check` → `check-generated.mjs`. verify.yml uses it only when mode ≠ push (`:144`) and uses `regenerate-guard.mjs drift-gate` otherwise (`:182–188`). | Make `check` read `.github/regen-mode` and run the matching gate, or add `check:push`. Also replace the inline bash in `verify.yml:147–173` with `check-generated.mjs`: the unquoted `$targets` word-splits the NUL-safe list that `generated-targets.mjs` builds. | Medium |
| C2 | `regenerate-preview.yml` repeats Verify's push-mode decision (`driftGate()` and `previewVerdict()` decide the same way) and does another full build on every docs/data/scripts PR | `regenerate-preview.yml:3–12, 40, 59–60` still say "planned gate" and "(shadow)" | Short term: fix the wording. Later: move the patch-artifact upload into verify's push-mode branch and delete the workflow. | Low / Medium |
| C3 | No dependency caching | No `cache:` on any `actions/setup-node`. Lighthouse runs `npm ci` in `tools/lighthouse` in both jobs (`lighthouse.yml`). | Add `cache: npm` (with `cache-dependency-path` for `tools/lighthouse` and `packages/mcp`) to verify, regenerate-preview, monthly-checks, source-watch, mcp-ci and lighthouse. Keep release-mcp and regenerate's publish job uncached. | Low |
| C4 | Repeated builds | verify.yml in push mode builds at `:95` and again at `:187`; Windows tests build at `:239`; on a merge, verify, regenerate (`:101`, `:110`, plus `npm test`) and pages (`:98`) each build the same commit | Drop the second build in the push-mode job once a check confirms the test suite leaves `site/` clean (it builds into temporary copies). | Medium |
| C5 | Lighthouse performance on every push to `main` | `lighthouse.yml` `push: branches: [main]` with no paths filter, plus a nightly cron | Add `paths-ignore: ['**/*.md', 'docs/**', '.github/ISSUE_TEMPLATE/**']` to `push` only (the required job runs on PRs). | Low |
| C6 | The "Regeneration mode" bash is copied in two jobs | `verify.yml:64–89` and `:215–235` | Move the base-branch fetch into `regenerate-guard.mjs mode --from-base`. | Low |
| C7 | `npm test` runs less than CI's integrity job | CI also runs `check-og`, `check-history` and `check-best`, which take seconds | Add them to `npm test`. | Low |
| C8 | The bot's commit re-runs Verify | `verify.yml:33–35` triggers on `data/**`, which includes the bot's `data/probe-report.json`; `regenerate.yml:28` already excludes it | Add `'!data/probe-report.json'` to verify's push paths. | Low |

The non-push paths (`regenerate.yml:192–218` shadow PR, `verify.yml:144` strict gate) are the documented rollback for `REGEN_MODE=off`. They are not dead code.

## Deferred: areas in flight

These findings sat in files or areas that open pull requests owned. Since then the brand stack (#844–#847), #903 and #904 have merged, and #905, #906, #907, #920, #921 and #935 picked up what was then free. What is still deferred, and why, is in the table below.

- **Brand stack (#844–#847):** orphaned CSS and the event-banner CSS (X5); `assets/logo-full.svg` (X4); the home title vs. body count (I4); OG's `esc` (D3).
- **Provider pages and SEO/AEO:** the `safeUrl` copy in `provider-sections.mjs` (D1); "not recorded" wording (I2); the inline provider JSON-LD at `build.mjs:1327`.
- **Structured data (#904):**
  - inline `@context` objects at `build.mjs:1044, 1129, 1812, 1857, 2205, 2371, 2413`, `find-page.mjs:98` and `model-pages.mjs:143`
  - ten inline `BreadcrumbList` objects where `page-jsonld.mjs:12` `breadcrumbList()` exists
  - FAQPage built inline at `build.mjs:1063, 1151, 1827, 1872`
  - `site-entity.mjs` constants (D5)
  - the `not-free.mjs` comment (X9)
- **#774 and #815 (`changes.mjs`, `history.mjs`):** `reportChangeUrl` (X2) and the `plural` copy (D1).
- **#903 (`docs/backlog.md`):** the probe-cron phrase (X8).

## Status of every finding

| Finding | Status | Pull request or reason |
|---|---|---|
| D1 `safeHttp`, `safeUrl`, `plural` | Fixed (10 of 14 copies) | #905. Deferred: the copies in `changes.mjs` and `provider-sections.mjs` (#774, #775 and #815 edit those files). `compare.mjs` keeps its copy because its source ships to the browser. |
| D2 inaccuracy-issue URL builder | Deferred | `reportChangeUrl` should be deleted, not wrapped (X2), and #774 edits the lines after it. The other two copies alone are not worth a helper. |
| D3 seven HTML escapers | Fixed | #920 (`scripts/lib/html.mjs`). #930 fixes a page module from #922 that still imported the old name and stopped the build on `main`. |
| D4 repeated fragments in `build.mjs` | Deferred | `build.mjs` is edited by #774, #775, #815 and #896. It is a refactor, not a fix. |
| D5 site and repository constants | Deferred | Same files as D4 (`build.mjs`), plus `monthly-issues.mjs` and `contributors.mjs`. Low payoff. |
| D6 dates | Deferred | Low payoff, and it overlaps the date-format work of finding 10 (I3). |
| D7 near-identical page generators | Deferred | The bytes of the site change, so it needs its own reviewed `site/` diff. |
| D8 test helpers | Deferred | Tests only, low value. Best done with T1 or T2. |
| X1 `generate-gfis.mjs` | Fixed | #907 |
| X2 `reportChangeUrl` | Deferred | #774 inserts code right after it. |
| X3 `MODEL_TIER_ATTRIBUTION` | Fixed | #907 |
| X4 `assets/logo-full.svg` | No change needed | The brand stack made it a generated asset (`scripts/icons.mjs`), pinned by `aura.test.mjs`. |
| X5 dormant event banner | Deferred | Owner decision: whether another dated campaign is planned. |
| X6 exports used only in their own file | Not planned | Cosmetic. Drop `export` when a file is edited for another reason. |
| X7 `package.json` comment | Fixed | #907. #935 rewrote it again for C1. |
| X8 "uncomment the publish step" | Fixed | #907 (`live-testing.md`), #935 (`backlog.md`) |
| X9 `not-free.mjs` comment | Fixed | #935 |
| X10 `startsRegeneration` | Fixed | #935 (derived from `REGENERATE_INPUTS`) |
| Orphaned CSS | Fixed (12 of 13 rules) | #935. The `.event-banner*` rules wait for X5. |
| I1 regeneration guidance | Fixed | #906. #935 covers the preview mentions. Deferred: `npm run sync-main` in push mode, which needs a code change and its own tests. |
| I2 unknown values, I3 date formats | In progress | Finding 10, in a separate pull request. |
| I4 "76 verified" and "77 providers" | Deferred | It changes what the home page says, so the owner decides the wording. |
| I5 analytics constants copied by hand | Deferred | Low risk, but it is a build change to `consent.client.js`, not a hygiene fix. |
| I6 naming | Not planned | Rename only when a file is edited for another reason. |
| I7 Node versions in the docs | Fixed | #935 |
| I8 test style | No change needed | Consistent enough. |
| T1 validator tests in-process | Deferred | A test refactor for its own pull request. The suite is green. |
| T2 one fixture build per test file | Deferred | Medium risk to test isolation. |
| C1 mode-aware `npm run check` | Fixed | #935. `npm run check` follows `REGEN_MODE` / `.github/regen-mode`, and `--strict` keeps the full gate. verify.yml's strict step calls it instead of inline bash. |
| C2 `regenerate-preview.yml` | Fixed | #935. The workflow is gone. Verify uploads the `regen-preview-patch` artifact itself, so each pull request gets one build instead of two. |
| C3 npm caching | Fixed | #921 |
| C4 repeated builds | Fixed | #921 (the push-mode job builds once), #935 (no preview build). The post-merge builds in regenerate and pages stay, because each workflow needs its own tree. |
| C5 Lighthouse on every push | Fixed | #921 (scoped to changes that can affect the site) |
| C6 "Regeneration mode" bash in two jobs | Deferred | Moving it into `regenerate-guard.mjs` means changing the step on Linux and Windows, and it is not broken. |
| C7 `npm test` vs CI's integrity job | Deferred | `check-og` cannot join `npm test` as it is: in push mode the bot renders OG images after the merge, so the check would fail locally for a correct data pull request. |
| C8 Verify re-runs on the bot's commit | Fixed | #935 |
