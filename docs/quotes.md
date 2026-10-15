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

## Adding or changing a row: `npm run quotes:add`

Write the `data_policy` of the provider in `data/providers.json` (its `quote`, `source`, `checked` and, if you have one, a `note`), then run

```
npm run quotes:add -- <slug>
```

The command reads the source page in English and writes the entries of that provider in `data/quotes.json`: the sentence, each phrase of the note
between « », and the absence check if the note says something about the whole page. It writes the day, the hash and the method itself; you never
type them. Then run `npm test`.

- If the quote or a phrase is **not literally on the page**, it says which one and writes nothing: fix the text, or copy it as the page spells it
  (curly quotes and apostrophes included).
- If a phrase comes from **another page** (for example a FAQ), say so: `npm run quotes:add -- <slug> --passage-url "<the phrase>=<its address>"`.
- If the note says something about the **whole page** ("the page has no mention of ..."), the command counts free, trial, paid and plan on the
  page; if any is there it refuses and tells you to say what the sentence or the clause names instead.
- A page that answers an error, needs scripts, or declares another language cannot be read this way; the message says so. Do not paste the
  entry by hand: open the pull request and say that the page could not be read, and a maintainer will read it from the server.
- To change a row that already has entries, change the row and run the command again: it replaces the entries of that provider and touches no
  other.
