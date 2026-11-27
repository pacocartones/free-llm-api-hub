### Changed and fixed

- Speechify (`speechify`): `free_limits` records 1 request per second on the
  Free plan, per account across every text-to-speech endpoint (also 3
  concurrent requests and a burst of 10), read on Speechify's API limits page
  on 2026-11-27. The other 32 providers in the first half of the backfill list
  publish no free-tier number in a unit the schema records, or are trial-credit
  offers, which carry no `free_limits`; they stay not stated.
