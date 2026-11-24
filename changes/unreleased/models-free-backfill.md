### Changed and fixed

- `models_free` samples for six active text-LLM providers that had none,
  each read from the provider's own catalogue on 2026-11-24 and tied to the
  free access recorded in the entry: IBM watsonx (Lite plan), Fireworks AI
  and Baseten (trial credit), Alibaba Cloud Model Studio (models whose
  Singapore free quota is still listed), AI Horde (text models served by
  volunteer workers on that day, which change often) and Tencent Hunyuan
  (TokenHub new-user quota for all language models). Five gain a
  `models_url`. IBM watsonx's `model_tier` moves from unknown to 2, from
  the Arena row of gpt-oss-120b (snapshot 2026-10-02) that SambaNova
  already cites; the trial-credit offers stay unrated, and no AI Horde model
  maps to an exact Arena row. NLP Cloud, Contextual AI, Upstage and Novita stay `null`:
  no official page read ties their free credits to model IDs, or the docs
  were unreachable (#455).
