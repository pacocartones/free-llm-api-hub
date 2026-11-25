### Changed and fixed

- Cerebras: `field_checks` now records the sentence behind
  `openai_compatible: true` (its OpenAI compatibility page says the API is
  compatible with OpenAI client libraries for many common workflows, with the
  same base URL as `openai_base_url`). The flag and the base URL are unchanged
  (#777).
