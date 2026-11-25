### Changed and fixed

- Alibaba Model Studio and ModelScope: `phone_required` is now `true`. The
  Alibaba Cloud registration guide says an account registered with an email
  address "must complete secure phone number verification", and the ModelScope
  registration form asks for a mobile number and an SMS code (#743, issue #7).
- `field_checks` recorded for five flags whose official pages were read on
  2026-11-25 and do not settle them (`source_silent`): `phone_required` for
  IBM watsonx.ai, Unstructured, Photoroom and Poolside, and `commercial_ok`
  for Poolside. The flags stay unknown; the site shows why and when they
  were checked (#743, issues #7 and #8). Agent-assisted: an AI agent read the pages
  and drafted the entries for maintainer review.
