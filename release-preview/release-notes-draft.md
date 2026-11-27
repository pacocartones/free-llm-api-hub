<!-- Title: v2.15.0 — 33 new providers, receipts for every yes/no flag, and the Cálida site -->
<!-- Draft, updated 2026-11-27 (afternoon) from the 143 fragments in changes/unreleased/ and the pull requests merged since v2.14.2 (main at 4a9e0eea, after #1044). Regenerate from the fragments in the 03-12 rehearsal. Full entries: release-preview/CHANGELOG-preview.md (older; the rehearsal rebuilds it). Rehearsal 2026-12-03, publication 2026-12-04. Delete this comment before publishing. -->

Thirty-three providers join the dataset (62 → 95), among them Amazon Bedrock,
OCI Generative AI, three Google Cloud APIs, Azure Speech and Document
Intelligence, Stability AI, Gonka Broker, Synap and several OpenAI-compatible
gateways. All are
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
`/not-free/`, `/embed/`, `/quality/`, `/contributors/` and long-form guides.
Provider pages are now titled by the question people ask ("Is the Groq API
free? Yes: …, checked <date>"), each has a Markdown twin, and the oldest
entries were re-verified on 27 November.

No breaking changes.

The full list of changes is in [CHANGELOG.md](https://github.com/pacocartones/free-llm-api-hub/blob/main/CHANGELOG.md#2150--2026-12-04).

### Added

**New providers (33).** Each was checked on the provider's own pages; the
checks were agent-assisted and every merge was approved by a maintainer.

- Speech, vision and documents: Azure Speech (F0) and Lemonfox.ai (#755);
  Google Cloud Text-to-Speech, Speech-to-Text and Vision (#942); Azure Document
  Intelligence (F0) and Reducto (#966); Stability AI (#805).
- LLM APIs and credits: Inception and Aion Labs (#741); MegaNova AI and SEA-LION
  (#750); Bytez, Liquid AI and Public AI (#790); Regolo.ai and Google Agent
  Platform express mode (#714); PLaMo, Entrim and Infomaniak (#816); Berget AI
  and Netlify AI Gateway (#903); Amazon Bedrock and OCI Generative AI (#956);
  Nscale and Lightning AI (#966).
- Gateways: Requesty, Kilo Gateway and Experiential Labs (#936).
- Latest additions: Gonka Broker, Moark (Gitee AI) and Morph (#1015); Synap by
  Linkrra, thanks to @weare-linkrra for the details (#1035).

**Dataset fields and files.**

- `field_checks`: why each yes/no flag holds its value, with the page and day
  read (#701, #719), backfilled for every flag that holds a value (#949) and
  enforced by `npm run validate` (#950).
- `/api/v1/status.json`: last verified, freshness state and `free_now` per
  provider, for clients that poll (#918). The MCP server 0.2.0 reads it in a new
  `get_provider_status` tool; the package is not published by this release (#940).
- `published_speed`: a speed figure only where the provider publishes one, in
  its own words (#728, #733).
- `anonymous_access` and a "no account needed" collection (#731, #737).
- `keys_url` and `keys_url_source`, shown as "Get a free key" on provider pages
  (#810, #895).
- Copy-paste API examples in curl, JavaScript and Python (#944).
- Releases can be mirrored to Hugging Face and Kaggle once credentials are set (#716).
- Free GPU compute: Kaggle Notebooks, and dated notes on the Azure free account,
  SageMaker Studio Lab, SaladCloud and Oracle Cloud Always Free; the retired
  free-gpu-cloud-credits project is merged in (#1001).
- The MCP server is ready for its first npm publication as
  `free-llm-api-hub-mcp` 0.2.0; publishing is a separate, owner-approved step
  (#1006).

**Site.**

- "Find my free API" (`/find/`): six questions, a ranked shortlist (#817).
- One page per model (#711) and per open model family (#922).
- Answer-first provider pages ("Is X API free?") with a six-question FAQ
  (#927, #952), and compare pages that answer "A vs B free tier" with their own
  FAQ (#955).
- Provider badges at `/badge/<slug>.svg` (#954), also offered as HTML (#849).
- An Atom feed of provider changes at `/changes.atom` and an answer-first
  `/changes/` (#957).
- `/not-free/`, `/embed/` (#787) and the "Cite this dataset" block on `/api/`
  and `/quality/` (#868); a public data quality page, `/quality/` (#765).
- Long-form guides: OpenAI alternatives, production checklist, highest limits,
  one per modality and one per thing you build (#808, #820, #898, #947).
- Markdown version of every provider page at `/p/<slug>.md`, and a reworked
  `llms.txt` (#901); `llms-full.txt` gains the commercial-use condition (#736)
  and each provider's prompt data policy (#807).
- A first-party consent banner; Google Analytics loads only for the categories
  a visitor allows (#710, #718).
- Question-shaped, dated titles on every provider page (#1034) and on the
  highest-limits, OpenAI-compatible and commercial-use guides and the home page
  (#1030); a dated "What other sources get wrong" block on eleven provider pages
  (#1030, #1037); stable anchors for each fact and a Markdown alternate in
  `<head>` (#1012).
- A six-question FAQ on the home page, built from the data (#998); "Report a
  mistake" on every provider page (#999); `/contributors/`, everyone whose work
  was merged (#953); five more model-family pages: Mistral, Kimi, MiniMax,
  Nemotron and Cohere Command (#1024).

### Changed and fixed

- **New look, "Cálida".** Warm palette, one colour per modality, Roboto Flex, a
  per-provider *aura*, the verified date as a *receipt* with its sources, new
  social images and a new brand mark (#844, #845, #846, #847).
- **Home and explorer.** Search and filters in the first viewport (#786), one
  control bar, a four-column table and a calmer hero (#892), a better
  "Recommended" order (#786), no full re-render on load (#754) and no layout
  shift on phones (#943).
- **Re-verifications.** Weekly batches and the stalest entries re-read on the
  providers' own pages, agent-assisted (#723, #725, #726, #734, #791, #818, #875,
  #925, #939, #946); trial credits re-checked for all 42 trial providers (#965);
  numeric `free_limits` for more providers (#941, #1038, #1039); on 27
  November the 23 oldest entries were re-read (#1017, #1019, #1043, #1044) and
  the last flags without a quote were re-checked (#1036). Notable changes: SambaNova and
  Photoroom `commercial_ok: false` (#697, #730), Vercel AI Gateway
  `card_required: true` (#925), Jina AI commercial use `conditional`, Alibaba
  and ModelScope `phone_required: true` (#743), NLP Cloud `commercial_ok:
  conditional` (its no-card Free plan is for development and testing only, #1036).
- **Data policies** recorded for IBM watsonx (#692), Photoroom (#698), Gladia
  (#783), Twelve Labs (#870), Cohere (#729) and five more (#708).
- **Official model catalogues** (`models_url`) linked for 13 more providers,
  and dated quotes on `/not-free/` for Replicate, GitHub Models and Featherless
  AI (#773, #821, #822, #833–#835, #842, #843, #860–#867).
- **Accessibility.** Table semantics on phones (#739), flags drawn with a shape
  as well as a colour (#813), keyboard-reachable doc tables (#934), underlined
  links on compare pages (#987), widget contrast (#932), no sideways scroll on a
  390px phone (#902, #964).
- **Wording.** One phrase, "not stated", for every value the dataset does not
  hold (#929), and the project describes itself as a dataset, not a list (#1000).
  README.md opens with a generated "Free LLM API list: N providers, checked
  <date>" line (#1037).
- **Search and structured data.** Rich Results errors fixed (#904), publisher
  and creator named, `Dataset` generated from `CITATION.cff`, retired URLs
  redirected, `robots.txt` reviewed in the repository (#764, #767), IndexNow
  (#721).
- **Security.** A tighter Content-Security-Policy (#945), `security.txt`
  (#724), secure analytics cookies, and a workflow policy test (#749).
- **Maintenance.** The regeneration bot commits derived files after each merge
  (#715, #742, #809), the release stamp moves only in a release pull request
  (#702), a weekly source watch for quotes (#771) and monthly community issues
  (#784). Contribution guide and issue forms follow the shared standard (#917). A merge
  queue in GitHub Actions tests approved pull requests together before merging
  them (#1009) and closes the issues they link (#1040).

### Contributors

A special thank you to **alvaro (@alvaroalonsoparrondo-a11y)** and **@AyhamJo7**.
Between them they sent 35 pull requests in two days: official model catalogues
and API-key pages for dozens of providers, dated quotes for the "Not free" list,
structured data, tests and data-policy lines. Each one was small, sourced and
easy to review.

Thanks also to everyone whose work was merged since v2.14.2:

| Contributor | Merged PRs |
|---|---|
| @alvaroalonsoparrondo-a11y | 28: #833–#843, #851–#867 (structured data for `/coding-tools/`, API-key pages, model catalogues, `/not-free/` quotes) |
| @BloosomNet | 8: #688, #690, #691, #692, #697, #698, #773, #776 |
| @AyhamJo7 | 7: #782, #785, #797, #807, #819, #821, #822 |
| @mananbharti | 3: #770, #869, #870 |
| @playlikeboy | 3: #868, #992, #994 |
| @Abhishekkumar071 | 2: #689, #722 |
| @aaas72 | 2: #768, #769 |
| @Aadithya-kl | 1: #931, merged as #948 (worklist footer for push mode) |
| @kragent66-glitch | 1: #962, merged as #987 (underlined compare links) |
| @KingEmma7 | 1: #934 (keyboard-accessible doc tables) |
| @Satwik0607 | 1: #900 |
| @bardrop | 1: #849 |
| @daocuong11 | 1: #848 |
| @duan-n2d | 1: #780 |
| @Lil-Clanky | 1: #736 |
| @MikeFTV | 1: #752 |
| @Sumit-sourabh45 | 1: #685 |
| @vivek-ambariya | 1: #781 |
| @Abhishek882772 | 1: #783 |

Issues, reviews, ideas and bug reports count too; they are not in this table
because they are not in the git history.

### Verify

Data commit: `<full commit at the official tag>`.
Tooling commit: `<snapshot.json toolingCommit>`; Node: `<snapshot.json nodeVersion>`.
Canonical JSON SHA-256: `<providers.canonical.json hash from SHA256SUMS>`.

The JSON, scalar CSV, schema and manifest are pinned snapshot assets. Verify all
asset bytes and the official tag (never an arbitrary local tag):

```bash
sha256sum -c SHA256SUMS
git fetch --no-tags origin "refs/tags/v2.15.0:refs/remotes/origin/tags/v2.15.0"
git rev-parse 'refs/remotes/origin/tags/v2.15.0^{commit}' # must equal the data commit above
git show refs/remotes/origin/tags/v2.15.0:data/providers.json | sha256sum
```

In a separate clean full checkout of that exact data commit:

```bash
git switch --detach <full-data-commit>
npm ci --ignore-scripts
npm run check -- --strict && npm test
```

See [release preparation](https://github.com/pacocartones/free-llm-api-hub/blob/main/docs/release-preparation.md) for reproduction from
the recorded tooling commit and Node version. Keep the data commit and tooling
commit distinct; neither checksums nor a tag replace CI and owner approval.
