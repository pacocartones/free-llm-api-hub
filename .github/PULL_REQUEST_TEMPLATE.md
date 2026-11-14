<!-- Thanks for contributing. Keep the checklist honest — an accurately-flagged uncertain entry beats a confident wrong one. -->

## What changed

<!-- e.g. "Update Groq daily limit"; "Add Acme Inference"; "Confirm phone_required for Cerebras"; "Add copy buttons to /api/" -->

<!-- Optional: use `Closes #123` only if this PR fully resolves the issue. For partial work, use `Related to #123`. Omit the reference if there is no issue. -->

## Source and date (data changes)

<!-- Link to the provider's OWN official docs and give the UTC date you checked them. Say what the page confirms and what remains unconfirmed. Third-party summaries don't count. Delete this section for code or docs-only changes. -->

## How I tested it

<!-- For data, code, or docs changes: list the commands you ran and their results. If a relevant check could not run, say why. -->

## Checklist

<!-- Remove items that do not apply. Leave a check you could not run unchecked and explain above. -->

- [ ] I ran `npm test` and it passed.
- [ ] **Data or build-input changes:** I ran `npm run build` (and `npm run og` if the OG check asked for it) and committed the regenerated files.
- [ ] **Build-input changes:** I ran `npm run check` and it found no drift.
- [ ] **Data changes:** I edited the canonical data by hand, not the generated files.
- [ ] **Data changes:** for a verified change, I set `verified: true` **with** a `last_verified` date (the day I checked) **and** a real `docs_url`.
- [ ] **Data changes:** anything I couldn't confirm against the provider's own docs stays `null` or `verified: false`, with a note saying what's unconfirmed.
- [ ] **`data_policy` changes:** I ran `npm run quotes:add -- <slug>` when required by `docs/quotes.md`.
- [ ] (Optional) I used AI tools for part of this change, and I have read and tested it myself.

<!--
There is no regeneration bot: the required "Dataset integrity" check fails until the
derived files are in sync with the data. If it says files are out of sync, run
`npm run build`, commit, and push again.
-->
