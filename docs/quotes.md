# The register of quoted passages

`data/quotes.json` lists every passage that a `data_policy` row quotes from a provider's page, so that no sentence enters the data without
its page, the day it was read and how the page text was made. It holds three kinds of entry:

| Kind | What it backs |
|---|---|
| `sentence` | the `quote` of a row: the provider's own sentence |
| `note_passage` | a phrase that a `note` puts between « » |
| `absence_check` | a note that says something about the **whole** page ("the page has no mention of ..."): a count, on the page as it was read, of the four words `free`, `trial`, `paid`, `plan` |

Each entry carries `source_url` (https), `read_on`, `lang` (the language of the passage and of the page it is read in), `method` (how the page
text was made, see `scripts/lib/page-text.mjs`) and `page_sha256` (the hash of that text, or `null` if the page could not be read). Only the
quoted fragment is stored, never a copy of the page.

## What CI checks, and what it does not

CI (`npm test`, `npm run check`) checks **consistency, offline**:

- the `sentence` of a row is byte for byte its `quote`, with the same source;
- every phrase between « » in a note has a `note_passage` of the same provider, and every `note_passage` is used by its note, so a phrase of
  our own put between guillemets fails;
- a note may say that a whole page has none of the four words only if its `absence_check` counted zero in all four. A claim limited to the
  sentence or the clause ("the sentence names no plan") cannot be tested by a machine and is not tested;
- dates, https addresses, hashes and hidden characters are in order.

CI does **not** check that the page says that today, or that it ever did. Nothing in this repository is "verified by CI" in that sense. That
needs a reading with the network, which is a separate job (`npm run verify-quotes`) with four results: `ok`, `expired` (the page was read, in
the right language, and the passage is no longer in it), `unreachable` (no page: a 403, a page that needs scripts, no network) and
`other_language` (the page declares a language other than `lang`; never "expired").

A search that finds none of the four words does not prove the page says nothing about plans in other words. A note says "has no mention of a
free, trial, paid or other plan": what was measured, no more.

## Reading a page

Pages are requested with `Accept-Language: en-US` (`READ_HEADERS`): at least one site (ai.google.dev) answers a Spanish copy to a request
with no language. The text is made as `scripts/lib/page-text.mjs` says: scripts and styles removed, tags replaced by a space, character
references decoded, white space collapsed. Curly quotes and apostrophes are kept as the page spells them.

## Adding a passage

Put the phrase between « » in the `note`, add its entry (id `<slug>.note_passage.<n>`) with the page it comes from, and run `npm test`: the
consistency check names what is missing. The register is built from the data by reading each source; do not edit `page_sha256` by hand.
