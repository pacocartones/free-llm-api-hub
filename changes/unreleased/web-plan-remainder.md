### Changed and fixed

- Structured data for the pages that had none: `/models/`, `/compare/` and `/programs/` are a `CollectionPage`
  with the list of their pages, `/changes/` and `/updates` a `CollectionPage`, `/api/` a `WebPage` about the
  dataset, and each static comparison lists its two provider pages. Every list now points to pages of this site:
  the collections listed each provider's own docs, which Google ignores in a list (#735).
- Every comparison page in the sitemap is now linked from `/compare/` ("More comparisons"), and the credit-program
  pages link back to `/programs/`; 15 pages could only be found through the sitemap (#735).
- `/updates/page/2/` onwards carry `noindex,follow`: thin lists of commit titles that only the first page needs
  to be indexed for (#735).
- Every page advertises the weekly change feed (`changes.xml`), and both feeds carry their own URL
  (`atom:link rel="self"`) (#735).
- The comparisons, the coding tools and the API have their own social image instead of the site-wide one (#735).
- `/api/` says that the API answers plain `GET` requests: custom headers trigger a preflight the host refuses (#735).
- Cookie settings: when reopened from the footer, Escape closes the panel without changing the choice and returns
  focus to "Cookie settings" (#735).
- A coding-tool page linked the `.html` address of a collection (#735).
