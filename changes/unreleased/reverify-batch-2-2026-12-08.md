### Changed and fixed

- Weekly re-verification batch for the week of 2026-12-08 (agent-assisted,
  official pages only, run 2026-11-25). Google Gemini, OVHcloud AI Endpoints,
  Cartesia, ElevenLabs and Gladia move `last_verified` to 2026-11-25 (#818).
- Google Gemini's free tier now lists the models its pricing page gives as
  "Free of charge" on the Free Tier: Gemini 4 Hydrogen, 3.8 Flash, 3.6 Flash,
  3.5 Flash-Lite, 3.1 Flash-Lite, 3 Flash Preview, 2.5 Flash-Lite, embeddings,
  the Flash TTS models and Gemma 4. Gemini 2.5 Pro and 2.5 Flash are deprecated,
  and API access to the 2.5 models is limited to existing users. Google's HTML
  docs now need scripts, so these facts were read from the official Markdown
  sources on ai.google.dev. Its terms page could not be read, so its data policy
  is unchanged (#818).
- OVHcloud AI Endpoints' catalog now marks ten models as Free. The new ones are
  three Olala-v1.0 text-generation models, so the entry now counts as a text LLM
  (`is_text_llm: true`). Stable Diffusion XL is being retired, with end of life
  on 2027-02-10 (#818).
- ElevenLabs' rate limits now give the Free plan's concurrency for each model
  family: 2 for Multilingual v2, 4 for Flash, 8 for Speech to Text and 6 for
  Realtime Speech to Text (#818).
- Fireworks AI's data policy was re-read (privacy notice last modified
  2026-09-16). Its $1 trial credit is not stated on the pages read, so it keeps
  its `last_verified` (#818).
- The source watch (#771) reported that the pages behind these quotes had
  changed. The quotes were re-read and their register entries refreshed, with
  no change to the data: Cartesia (its terms moved to www.cartesia.ai),
  ElevenLabs, Fireworks AI, AI21 Labs, AssemblyAI, Deepgram and Jina AI (#818).
