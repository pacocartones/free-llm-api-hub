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

These collapse into **`probe_status`**: `live` · `auth-ok` · `auth-failed` · `tier-ended` (key works but the free tier looks gone, e.g. `402`) · `rate-limited` · `error`. `auth-ok` means that `/models` accepted the credential but no inference was attempted; only `live` means a real free-tier inference call succeeded and earns the **live-tested** badge. A `tier-ended` result is a strong signal to move the entry to "Notably NOT free". The full per-run detail is written to `data/probe-report.json`.

`live` results show a **live-tested** badge on the provider page. Auth-only CI results show the narrower **credentials checked** badge instead.

## Secrets — transport-agnostic by design

The probe reads keys from `process.env[env_key]` (each provider declares its `env_key` in `data/providers.json`). It does **not** care how they got there — so any injector works. Keys are used only in `Authorization` headers; they are never logged, written to the dataset, or committed.

**Active path: local environment.** Run `npm run probe -- --write --auth-only` whenever you have keys handy. The probe picks up whatever `process.env[env_key]` names are set — any subset works, so you can probe one provider at a time; missing keys are simply skipped. It deliberately records `auth-ok`, not `live`, because it does not perform inference.

**Alternative: a self-hosted Infisical on the same VPS** that runs the probe, so secrets never leave the box.

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

## Setup checklist — resume here

Everything on the code side is built, tested and committed (harness, fields, badge, docs), and the probe is a plain local command — there is no GitHub Actions path: **the only step left for basic coverage is having provider keys in the environment** — any subset, under each provider's `env_key` name (via Infisical, a `.env` file, or your shell). The two decisions below only matter for the VPS path.

**Two decisions for the VPS path** (both were deliberately left open; the code is agnostic to either):
- [ ] **Infisical reachability** — localhost-only on the VPS (everything runs there) *or* a public HTTPS domain (lets probes also be piloted from a laptop session).
- [ ] **Zero-Actions deploy** — VPS builds and pushes to a `gh-pages` branch (GitHub serves it, 0 Actions minutes) *or* the VPS serves the site via nginx *or* keep the light `pages.yml`. This unblocks the commented publish step in `scripts/probe-cron.sh`.

**Infisical setup (on the VPS):**
- [ ] Create a project folder, e.g. `/free-llm-api-hub`, environment `prod`.
- [ ] Add each provider's key under the exact name the repo expects (its `env_key`). Print the full slug → env-var mapping straight from the data (stays current automatically):
  ```bash
  node -e "for(const p of require('./data/providers.json').providers) if(p.env_key) console.log(p.slug.padEnd(24), p.env_key)"
  ```
  You don't need all of them at once — any subset works; only providers whose key is present get probed.
- [ ] Create a **read-only Machine Identity** scoped to that folder/env; note its Client ID + Secret (or a service token).
- [ ] On the VPS, put the identity creds in a root-only file (not the repo): `/etc/free-llm-api-hub.env` with `INFISICAL_API_URL`, `INFISICAL_PROJECT_ID`, `INFISICAL_ENV`, `INFISICAL_PATH`, and the token/creds. With Infisical on `127.0.0.1`, secrets never leave the box.

**First real run:**
- [ ] Dry run to see who's reachable: `infisical run --projectId <id> --env prod --path /free-llm-api-hub -- npm run probe`
- [ ] Persist it: same command with `node scripts/probe.mjs --write`, then `npm run build`, review the diff, commit.
- [ ] Wire the cron (see `scripts/probe-cron.sh`) once the deploy decision is made.

**Then (phase 2, all in [backlog.md](backlog.md)):** provider-specific adapters for the non-OpenAI APIs; render `data/probe-report.json` as a "live-tested N/51" badge + a *measured* "fastest free APIs" collection; auto-flag `tier-ended` results onto the re-verification worklist.

---

_[← Docs index](README.md) · [Main README](../README.md)_
