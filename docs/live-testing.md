# Live testing

A second, stronger axis of trust on top of doc-verification: **actually calling each provider's free tier with a real key and recording that it answered.** `verified` says "confirmed against the provider's docs on `last_verified`". `last_probed` / `probe_status` say "we made a real API call and here's what happened."

The two are independent on purpose — a provider can be doc-verified but not yet live-probed, or live-probed even while a doc re-check is due.

## What the probe records

Per provider (`scripts/probe.mjs`, `npm run probe`):

- **auth** — does the key authenticate against `/models`? (distinguishes `401/403` = wrong key from `200`).
- **models** — the live `/models` list → refreshes `models_free` with real IDs.
- **inference** — one minimal real call (chat `max_tokens:1`, or an embeddings call for embeddings-first providers). A `200` with a valid body ⇒ the free tier is genuinely usable right now.
- **latency & tokens/sec** — measured from the call + `usage`, feeding an honest (measured, not claimed) speed signal.
- **rate-limit headers** — `x-ratelimit-*`, `retry-after` straight from the API — the real current limits, not scraped prose.

These collapse into **`probe_status`**: `live` · `auth-failed` · `tier-ended` (key works but the free tier looks gone, e.g. `402`) · `rate-limited` · `error`. A `tier-ended` result is a strong signal to move the entry to "Notably NOT free". The full per-run detail is written to `data/probe-report.json`.

`live` results show a **live-tested** badge on the provider page.

## Secrets — Infisical (self-hosted), transport-agnostic

The probe reads keys from `process.env[env_key]` (each provider declares its `env_key` in `data/providers.json`). It does **not** care how they got there — so any injector works. Keys are used only in `Authorization` headers; they are never logged, written to the dataset, or committed.

Recommended: a **self-hosted Infisical on the same VPS** that runs the weekly job, so secrets never leave the box.

1. In Infisical, create a folder (e.g. `/free-llm-api-hub`, env `prod`) and add each key under the canonical name the repo expects (the provider's `env_key`, e.g. `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `GEMINI_API_KEY`, …).
2. Create a **read-only Machine Identity** scoped to that folder/env. Store its creds in a root-only file on the VPS (`/etc/free-llm-api-hub.env`), never in the repo.
3. Run the probe wrapped by the CLI, which injects the secrets as env vars:
   ```bash
   infisical run --projectId <id> --env prod --path /free-llm-api-hub -- node scripts/probe.mjs --write
   ```
   With Infisical on `127.0.0.1`, the secrets never traverse the network.

`scripts/probe-cron.sh` wraps this for the weekly VPS cron (probe → model refresh → validate → build → push), publishing without spending GitHub Actions minutes.

## Modes & footprint

```bash
npm run probe                     # dry run: report only, no writes
node scripts/probe.mjs --write    # persist last_probed/probe_status/models_free + report
node scripts/probe.mjs --auth-only   # skip inference (near-zero footprint)
node scripts/probe.mjs --only=groq,cerebras
```

Footprint is one `/models` call + one 1-token inference per provider. A provider is probed **only if its key is present in the environment**, so running with no keys is a safe no-op. Coverage today is the generic OpenAI-compatible path; provider-specific adapters (Gemini native, Cohere, Deepgram, …) are on the [backlog](backlog.md).

---

_[← Docs index](README.md) · [Main README](../README.md)_
