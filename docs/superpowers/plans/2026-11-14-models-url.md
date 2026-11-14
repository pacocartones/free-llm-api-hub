# Provider model-catalog URL implementation plan

**Goal:** Add an optional, sourced `models_url` field that links a provider page to its official model catalogue without implying every listed model is free.

**Contract:** `models_url` is absent unless verified, must be a public HTTPS URL, and is independent from the sampled `models_free` array. Provider pages render it as an external catalogue link, including when no sample is recorded.

## Tasks

1. Add failing coverage for schema/validator rejection, safe rendering, the no-sample state, and the exact three seeded providers.
2. Add `models_url` to the schema, integrity validator, hidden-character checks, and canonical serializer.
3. Render a safely escaped official-catalogue link in `modelsHtml` and document the field in the comparison dimensions.
4. Seed Google Gemini, Groq, and Mistral from their official model catalogue pages.
5. Rebuild generated artifacts, run the focused tests, full test suite, generated-file check, and diff checks.
