### Changed and fixed

- Site: the Content-Security-Policy of every page is tighter. It adds
  `script-src-attr 'none'`, `font-src 'self'`, `manifest-src 'self'`,
  `worker-src 'none'`, `form-action 'self'` and `upgrade-insecure-requests`,
  and the two inline-script hashes are now computed by the build from the
  scripts it writes instead of being typed in by hand. Redirect stubs get
  `default-src 'none'`. A new test (`scripts/csp.test.mjs`) pins the exact
  policy, checks every inline script is hashed, and rejects inline event
  handlers, mixed content, unpinned third-party subresources and
  `target="_blank"` links without `rel=noopener`.
