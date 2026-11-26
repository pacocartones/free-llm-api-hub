### Added

- Published releases can be mirrored to a Hugging Face dataset and to Kaggle (a new
  version per release) by `mirror-dataset.yml`, with a generated dataset card that links
  back here and explains that `null` means unconfirmed. Each destination is skipped until
  its credentials are configured. GitHub stays the source of truth (#716).
