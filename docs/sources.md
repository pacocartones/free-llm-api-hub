# Discovery sources & competitive map

Where new providers are found, and how the field around us looks. Discovery is
part of the routine, not a one-off — this catalog turns "find new free APIs"
into a repeatable pass. Every lead surfaced here is still run through the
[inclusion criteria](inclusion-criteria.md) and cited to the **provider's own
docs** before it enters [`data/providers.json`](../data/providers.json). Lists
never become the source; they only point at one.

_Last mapped: 2026-07-31._

## The one rule for mining lists

Most "free LLM API" lists are contaminated with **unofficial proxies and
resellers** (re-exposing someone else's models without authorization). We never
list those, and we never treat a list as evidence. A source is only a _lead_;
the citation must be the provider's own pricing/rate-limit page. Rate each
source for trust before leaning on it.

## Regular-mining shortlist (top 5)

Run these on the monthly "what's new" scan (see the
[update playbook](update-playbook.md)):

1. **OpenRouter `/api/v1/models`** — unauthenticated JSON with `:free` variants
   that rotate ~weekly. The single best _automatable_ discovery diff.
   **`npm run discover`** ([`scripts/discover.mjs`](../scripts/discover.mjs))
   reports what's new since the last snapshot and which publishers with free
   models we don't yet list as a first-party provider.
2. **[cheahjs/free-llm-api-resources](https://github.com/cheahjs/free-llm-api-resources)**
   — the incumbent, high-trust (cites official docs, excludes proxies,
   bot-updated). Benchmark our coverage and freshness against it.
3. **freellm.net + its repo (open-free-llm-api/awesome-freellm-apis)** — our
   closest architectural twin (live-probed directory + daily repo). Watch for
   new providers and competitive moves. Note: it is also a backlink funnel for
   a commercial product, so cross-check its claims.
4. **[wotai.co/blog/best-free-llm-apis](https://wotai.co/blog/best-free-llm-apis)**
   — honest, live-probed editorial list; shares our live-testing thesis. Good
   cross-check on what is _genuinely_ free right now.
5. **Portkey's open-sourced LLM pricing dataset** — a verifiable model/pricing
   catalog to reconcile provider and model coverage against.

Runner-ups worth a slower pass: **mnfst/awesome-free-llm-apis** (permanent-free
only) and the **Generative AI** section of **ripienaar/free-for-dev**.

## Trust classification

- **Trustworthy leads (cite official docs — safe to mine):** OpenRouter
  `/models` JSON, cheahjs/free-llm-api-resources, mnfst/awesome-free-llm-apis,
  freellm.net, wotai.co, free-llm.com, Analytics Vidhya's "Free LLM APIs"
  roundup, provider-comparison posts from Portkey / Helicone / Eden AI,
  ripienaar/free-for-dev, and — for the [credit-programs](credit-programs.md)
  companion — cloudcredits.io and the GitHub Student Developer Pack.
- **Proxy-heavy — never list their methods as offerings:**
  zukixa/cool-ai-stuff, xtekky/gpt4free, LiLittleCat/awesome-free-chatgpt,
  TokenMix. Useful only to see _which_ models people wish were free.
- **Drop / correct:** r/FreeLLM (does not exist — "FreeLLM" is only a brand),
  freeaihub.com (dead/spam redirect), Unify (pivoted away from routing),
  awesome-huge-models (archived).

## Competitive landscape (for SEO awareness)

The primary keyword is **"free LLM API"**. Direct competitors on that head term:

| Competitor | Type | Angle | Trust |
|---|---|---|---|
| cheahjs/free-llm-api-resources | GitHub repo | The incumbent; official-docs tables, bot-updated | High |
| freellm.net | Website + repo | Live-probed directory; sells a router/key-vault product | Mixed (has an agenda) |
| freellmapi.co | Website | A self-hosted OpenAI-compatible router ($19/yr), not a hand-verified catalog | Mixed |
| wotai.co | Blog | Live-probed editorial, tiers by real usability | High |
| mnfst/awesome-free-llm-apis | GitHub repo | Permanent-free only, exact-keyword name | High |
| OpenRouter (blog + `/models`) | Aggregator | Ranks for the term; sells routed inference | Mixed (agenda) |

**Our two differentiators — lean on both:**

1. **Live testing.** We actually call each free tier with a real key
   (`last_probed` / `probe_status`; see [live-testing.md](live-testing.md)).
   Only freellm.net, wotai.co and TokenMix even claim this — and TokenMix is a
   proxy funnel.
2. **Neutrality.** No proxy, no affiliate, no router of our own to sell. Every
   other high-traffic source on the term has a commercial routing/reselling
   agenda that shapes what it lists. We cite the provider and stop there.

## Adjacent spaces (kept separate, not head-term rivals)

- **Apply-to-get credits** (startup/student/research) → our
  [credit-programs](credit-programs.md) companion. Leads: cloudcredits.io,
  aicredits.dev, aistudentdiscount.com, studentoffers.co (AI/ML category).
- **Free GPU / self-hosting compute** → the
  [self-hosting](self-hosting-on-free-compute.md) companion. Lead:
  ripienaar/free-for-dev.

---

_[← Docs index](README.md) · [Main README](../README.md)_
