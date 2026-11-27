### Changed and fixed

- Nutrient (`nutrient`): `free_limits` records 100 requests per minute per API
  key on the DWS Processor API, which Nutrient says applies across all plan
  levels, read on its DWS Processor pricing page on 2026-11-27. The Data
  Extraction API publishes no number. The other 32 providers in the second half
  of the backfill list publish no free-tier number in a unit the schema
  records, or are trial-credit offers, which carry no `free_limits`; they stay
  not stated.
