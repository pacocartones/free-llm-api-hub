### Added

- Translation scaffolding for the Spanish site (launch planned for January 2027, after v2.16): string catalogues (`i18n/en.json`, `i18n/es.json`), a `t()` helper with plurals and Spanish dates and numbers (`scripts/lib/i18n.mjs`), and `npm run build:es`, which writes the home page and every provider page under `/es/` with `hreflang` alternates, `lang="es"`, their own canonical URLs and a Spanish sitemap. A default build is unchanged, byte for byte. See `docs/i18n.md`.
