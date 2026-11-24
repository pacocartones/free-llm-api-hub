### Changed and fixed

- `data_policy` recorded for Cohere from its own policy page (agent-assisted):
  section 2.3 says the inputs and outputs of Trial Users (free trial accounts
  with no payment method on file) are used to improve the performance and
  safety of its AI models, after steps to de-identify them, so
  `trains_on_prompts` is `true` and the clause names the trial plan. Retention
  is stated only for Enterprise Users, so it stays unknown for the free trial.
  With this row every provider listed in #442 and #445 has a recorded
  `data_policy`.
