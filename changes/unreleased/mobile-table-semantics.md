### Changed and fixed

- The provider table keeps its table semantics on phones. The card layout
  sets `display: block` on the table, which makes some screen readers
  (VoiceOver on iOS, some Chromium versions) drop the rows, cells and column
  headers; the markup now states `table`, `rowgroup`, `row`, `columnheader`
  and `cell` roles explicitly. The visible card labels are drawn with an empty
  alternative text, so the column name is not read twice.
