### Changed and fixed

- `data_policy` recorded for Gladia from its official data-retention documentation (checked 2026-11-25): Free accounts retain audio input, transcription output, API metadata and logs for 1 year by default (paid accounts keep audio and transcripts 3 weeks; only Enterprise offers custom or zero retention), while `trains_on_prompts` remains `null` because Gladia's Pricing/Security pages and Compliance Hub conflict on default training (#783, related to issue #744). Thanks @Abhishek882772.
