### Added

- A "no account needed" collection (`collections/anonymous-access.md` and
  `/collections/anonymous-access`): providers whose own page says the API can
  be called with no account, each row quoting that sentence and the day it was
  read. It rests on a new optional `anonymous_access` object (`source`,
  `checked`, `quote`, optional `note`), validated like `no_expiry`. First
  entries: AI Horde (shared anonymous key `0000000000`) and OVHcloud AI
  Endpoints, whose note records that the same page also says a key is needed
  in each request (#731, issue #182).
