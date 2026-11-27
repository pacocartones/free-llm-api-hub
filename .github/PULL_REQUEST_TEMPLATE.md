<!-- Thanks for contributing. Keep the checklist honest — an accurately-flagged uncertain entry beats a confident wrong one. -->

## What changed

<!-- e.g. "Update Groq daily limit"; "Add Acme Inference"; "Confirm phone_required for Cerebras"; "Add copy buttons to /api/" -->

<!-- Optional: use `Closes #123` only if this PR fully resolves the issue. For partial work, use `Related to #123`. Omit the reference if there is no issue. -->

## Source and date (data changes)

<!-- Link to the provider's OWN official docs and give the UTC date you checked them. Say what the page confirms and what remains unconfirmed. Third-party summaries don't count. Delete this section for code or docs-only changes. -->

## How I tested it

<!-- See https://github.com/pacocartones/free-llm-api-hub/blob/main/CONTRIBUTING.md#which-checks-to-run.
List the exact commands you ran and their results, plus any manual checks.
For docs/templates, preview the text or form and open the changed links.
If a relevant check could not run, include the error and why it is blocked. -->

## Remaining work or questions

<!-- Optional: use a draft PR for unfinished work. Say what is missing or where you need feedback; delete this section if ready for review. -->

## Checklist

<!-- Remove items that do not apply. Leave a check you could not run unchecked and explain above. -->

- [ ] I ran the checks for my change in CONTRIBUTING.md and the issue, and recorded commands and results above.
- [ ] **Code, data or build-input changes:** I ran `npm test` and it passed.
- [ ] **Docs or template text:** I previewed the changed text and opened its links.
- [ ] **Data or build-input changes:** I ran `npm run build` (and `npm run og` if the OG check asked for it). Outside push mode I committed the regenerated files; in push mode I committed none of them (the bot does it after the merge).
- [ ] **Build-input changes:** I ran `npm run check` and it passed (in push mode it runs CI's push-mode gate).
- [ ] **Data changes:** I edited the canonical data by hand, not the generated files, and left `generated` and `version` as they are (they move only in a release).
- [ ] **User-visible changes:** I added a changelog fragment `changes/unreleased/<short-name>.md` instead of editing `CHANGELOG.md`.
- [ ] **Data changes:** for a verified change, I set `verified: true` **with** a `last_verified` date (the day I checked) **and** a real `docs_url`.
- [ ] **Data changes:** anything I couldn't confirm against the provider's own docs stays `null` or `verified: false`, with a note saying what's unconfirmed.
- [ ] **`data_policy` changes:** I ran `npm run quotes:add -- <slug>` when required by `docs/quotes.md`.
- [ ] **`field_checks` or `published_speed` changes:** I ran `npm run quotes:add -- <slug> --field <flag>` for each `stated` entry with a `quote`, or `npm run quotes:add -- <slug> --speed`.
- [ ] (Optional) I used AI tools for part of this change, and I have read and tested it myself.

<!-- Taking part in a program such as Social Winter of Code? Link the program issue with `Closes #123`. A maintainer adds the level label when merging. -->

<!--
Derived files (README tables, collections/, site pages, CSV, sitemap, OG images) depend on the
regeneration bot's mode, printed by the "Regeneration mode" step of the "Dataset integrity" check
(docs/regeneration-bot.md):
- mode=push: do not regenerate or commit derived files. The bot commits them to main after the
  merge. The check fails only if you edited a derived file by hand or this is a release PR.
- any other mode: the check fails until they are in sync. Run `npm run build`, commit, push again.
Either way the check lists the stale files in its run summary and offers them as a patch
artifact (`regen-preview-patch`).
-->
