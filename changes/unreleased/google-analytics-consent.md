### Added

- The site now shows a first-party GDPR consent banner, and Google Analytics 4
  loads only for the categories a visitor allows. Every page offers "Accept
  all", "Reject all" and "Customize", with two independent categories, both
  off by default: analytics, and advertising & personalised measurement
  (Google signals). The choice is remembered in local storage and reopened
  from "Cookie settings" in the footer. Nothing loads from Google until a
  category is allowed; Consent Mode v2 starts with everything denied and
  grants only what the visitor chose. The privacy page describes the
  processing. Analytics is switched on by the repository variable
  `GA_MEASUREMENT_ID`; without it the site ships no analytics code and no
  cookies (#710).
