### Added

- Optional Google Analytics 4 behind a GDPR consent banner. It is off until the
  repository variable `GA_MEASUREMENT_ID` is set: with it empty the site ships
  exactly as before, with no analytics code and no cookies. With it set, every
  page gets a first-party banner with "Accept all", "Reject all" and
  "Customize", and two independent categories, both off by default: analytics,
  and advertising & personalised measurement (Google signals). The choice is
  remembered in local storage and reopened from "Cookie settings" in the
  footer. Nothing loads from Google until a category is allowed; Consent Mode
  v2 starts with everything denied and grants only what the visitor chose. The
  CSP allows the Google hosts and the privacy page describes the processing
  only in that case.
