### Changed and fixed

- `data_policy` recorded for five more providers from their own pages:
  Hugging Face (Inference Providers stores no user data for training and keeps
  no request bodies; debug logs up to 30 days), W&B Inference (CoreWeave does
  not train on Inference Content; zero data retention by default), Z.ai (no
  training on API User Content unless agreed; API texts not stored), Veryfi
  (submitted documents may train its proprietary, non-generative models;
  business opt-out) and Voicegain (retention 0 seconds to 7 days; training not
  stated, so `trains_on_prompts` stays unknown) (#708).
