### Changed and fixed

- The 17 retired provider and comparison URLs that Google still knew (and reported as 404 in Search
  Console) now redirect: a retired provider to its section on `/not-free/`, a retired comparison to
  the interactive `/compare/?compare=a,b` view while both providers are listed, otherwise to
  `/compare/`. The map lives in `data/redirects.json`; each stub is `noindex`, carries a canonical
  link and stays out of the sitemap, and the build fails if a source is built as a real page again
  or a target does not exist.
