// brand.mjs — the words of the brand that more than one surface prints.
//
// ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
// │ PLACEHOLDER — TAGLINE NOT CHOSEN YET.                                                                        │
// │ The owner has not picked the tagline (candidates: "Every limit quoted. Every quote dated.", "We read the     │
// │ docs. You ship the code.", "Know the catch before you sign up." …). Until then it is the current home title. │
// │ To change it everywhere, edit TAGLINE (and TAGLINE_KEY, the closing phrase set in the accent colour), then   │
// │ run `npm run build`, `npm run og` and `npm run brand-assets`. Nothing else needs editing.                     │
// └──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
//
// Read by: the home page H1 (scripts/build.mjs, AUTOGEN:tagline in site/index.html), the README (AUTOGEN:tagline),
// the home social image (site/og.svg via lib/og.mjs), the README banner and the GitHub social preview
// (scripts/brand-assets.mjs). scripts/brand.test.mjs checks that each of them carries it.

export const TAGLINE = 'Free LLM APIs you can actually build on.';

/** The closing phrase of TAGLINE that the hero sets in the accent; '' for none. It must be the end of TAGLINE. */
export const TAGLINE_KEY = 'actually build on.';

/** TAGLINE split at TAGLINE_KEY: [lead, key]. */
export function taglineParts(tagline = TAGLINE, key = TAGLINE_KEY) {
  if (key && tagline.endsWith(key)) return [tagline.slice(0, tagline.length - key.length).trimEnd(), key];
  return [tagline, ''];
}

/** The descriptor under the name where there is room for one line about what this is. */
export const DESCRIPTOR = 'Every free AI API tier, quoted and dated.';
