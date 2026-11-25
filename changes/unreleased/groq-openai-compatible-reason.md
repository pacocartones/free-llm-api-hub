### Changed and fixed

- Groq: `field_checks` now records the sentence behind `openai_compatible: true`
  (its OpenAI compatibility page says the API was designed to be mostly
  compatible with OpenAI's client libraries, with the same base URL as
  `openai_base_url`). The flag and the base URL are unchanged (#777).
