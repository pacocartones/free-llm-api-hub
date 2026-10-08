<!-- Thanks for contributing. Keep the checklist honest — an accurately-flagged uncertain entry beats a confident wrong one. -->

## What changed

<!-- e.g. "Update Groq daily limit"; "Add Acme Inference"; "Confirm phone_required for Cerebras"; "Add copy buttons to /api/" -->

Closes #

## Source (data changes)

<!-- Link to the provider's OWN official docs confirming this change, and the date you checked. Third-party summaries don't count. Delete this section for code or docs changes. -->

## How I tested it (code or docs changes)

<!-- Commands you ran and what you checked. Delete this section for data-only changes. -->

## Checklist

- [ ] I ran `npm test` and it passed.
- [ ] I ran `npm run build` (and `npm run og` if the OG check asked for it) and committed the regenerated files.
- [ ] **Data changes:** I edited `data/providers.json` by hand and nothing generated from it.
- [ ] **Data changes:** for a verified change, I set `verified: true` **with** a `last_verified` date (the day I checked) **and** a real `docs_url`.
- [ ] **Data changes:** anything I couldn't confirm against the provider's own docs stays `null` or `verified: false`, with a note saying what's unconfirmed.
- [ ] (Optional) I used AI tools for part of this change, and I have read and tested it myself.

<!--
There is no regeneration bot: the required "Dataset integrity" check fails until the
derived files are in sync with the data. If it says files are out of sync, run
`npm run build`, commit, and push again.
-->
