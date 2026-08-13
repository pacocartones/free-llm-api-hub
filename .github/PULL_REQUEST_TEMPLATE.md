<!-- Thanks for contributing. Keep the checklist honest — an accurately-flagged uncertain entry beats a confident wrong one. -->

## What changed

<!-- e.g. "Update Groq daily limit"; "Add Acme Inference"; "Mark Cohere re-verified" -->

## Source

<!-- Link to the provider's OWN official docs confirming this change. Third-party summaries don't count. -->

## Checklist

- [ ] I edited **`data/providers.json`** and nothing else.
- [ ] I ran `npm test` and the dataset validation passed.
- [ ] For a verified change, I set `verified: true` **with** a `last_verified` date (today) **and** a real `docs_url`.
- [ ] For anything I couldn't confirm against the provider's own docs, I left it `verified: false` and explained what's unconfirmed.

<!--
Please run `npm run build` (and `npm run og` if the OG check flags drift) and commit
the regenerated files together with the data change — there is no regeneration bot,
and the required "Dataset integrity" check fails until the derived files are in sync.
-->
