### Changed and fixed

- `anonymous_access` recorded for two more providers after a survey of all 64
  entries against their own pages on 2026-11-25 (agent-assisted reading):
  Jina AI, whose Reader repository says "Anonymous traffic is the most
  aggressively rate-limited and lands in the lowest-trust pool" (Reader only;
  its Embeddings, Reranker and search APIs need a key), and OCR.space, whose
  API page publishes the shared `helloworld` key in samples that are "ready to
  run without any further edits". Pollinations was checked and does not
  qualify: its docs require a secret key for generation requests and leave
  only model listing open.
