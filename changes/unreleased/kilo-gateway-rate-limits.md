### Changed and fixed

- Kilo Gateway (`kilo-gateway`): the rate limit now says that free models are
  limited to 200 requests an hour per IP address for signed-in requests too,
  not only anonymous ones. Kilo's usage and billing page (read 2026-11-27) says
  "All free model requests (both anonymous and authenticated) are rate-limited
  by IP address". The entry used to say the signed-in limit was not published.
