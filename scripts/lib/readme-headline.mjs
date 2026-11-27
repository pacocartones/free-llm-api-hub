// readme-headline.mjs — the first line of README.md, generated from the data.
//
// The AEO baseline of 27 Nov 2026 found that the pages assistants cite open with the question, a count and a date.
// The README opened with an HTML <div>, so its first line said nothing a reader or a crawler could quote. The build
// now writes line 1 as "# Free LLM API list: N providers, checked <date>": N is every provider in data/providers.json
// and the date is the dataset's own as-of day (datasetAsOf: the newest date recorded in the data, never the clock),
// so the line moves only when the data does and the build stays byte-stable.

import { humanDate } from './dates.mjs';

export const README_HEADLINE_PREFIX = '# Free LLM API list: ';

/** "# Free LLM API list: 94 providers, checked 27 Nov 2026". */
export function readmeHeadline({ providers, asOf }) {
  const day = humanDate(asOf);
  if (!day) throw new Error(`readmeHeadline: the as-of day must be YYYY-MM-DD, got ${JSON.stringify(asOf)}`);
  const n = providers.length;
  return `${README_HEADLINE_PREFIX}${n} provider${n === 1 ? '' : 's'}, checked ${day}`;
}

/**
 * README.md with its first line replaced by `headline`. The first line must already be the generated headline (any
 * count and date): a README whose first line is something else is refused, so the line cannot be dropped or moved
 * down by a hand edit without the build saying so.
 */
export function withReadmeHeadline(md, headline) {
  const nl = md.indexOf('\n');
  const first = nl < 0 ? md : md.slice(0, nl);
  if (!first.startsWith(README_HEADLINE_PREFIX)) {
    throw new Error(`README.md: the first line must be the generated headline ("${README_HEADLINE_PREFIX}N providers, checked <date>"), found ${JSON.stringify(first.slice(0, 60))}`);
  }
  return headline + (nl < 0 ? '\n' : md.slice(nl));
}
