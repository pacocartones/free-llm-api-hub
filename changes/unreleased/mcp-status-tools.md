### Added

- **MCP server 0.2.0 (`packages/mcp`, not published by this change): provider status and "Is it free?".** A
  `get_provider_status` tool reads `/api/v1/status.json` for one provider or all of them (last verified, freshness
  against the 60/90-day SLA, `free_now`, last change). `search_providers` and `get_provider` add a `freshness` field
  when `status.json` is available and comes from the same build. An `is_free` tool answers "Is <provider> API free?"
  with the provider page's own sentence, "not stated" for a null field, and the day each fact's source was read; a
  test keeps its wording identical to the site's. New optional local override `--status` / `FLAH_STATUS`. No existing
  tool name or output field changes (#940).
