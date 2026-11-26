### Changed and fixed

- Groq and Cerebras: `field_checks` now record the sentence behind
  `openai_compatible: true`. Groq's OpenAI compatibility page says the API was
  designed to be mostly compatible with OpenAI's client libraries; Cerebras's
  says it is compatible with OpenAI client libraries for many common workflows.
  Both give the same base URL as `openai_base_url`. The flags and the base URLs
  are unchanged (#785, #797, issue #777). Thanks @AyhamJo7.
