### Added

- Optional Google Analytics 4 behind a GDPR consent banner. It is off until the
  repository variable `GA_MEASUREMENT_ID` is set: with it empty the site ships
  exactly as before, with no analytics code and no cookies. With it set, every
  page gets a first-party banner (Accept and Reject side by side, remembered in
  local storage, reopened from "Cookie settings" in the footer); nothing loads
  from Google until the visitor accepts, and then only analytics, with every
  advertising signal denied (Consent Mode v2). The CSP allows the Google hosts
  and the privacy page describes the processing only in that case.
