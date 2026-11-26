// brand.mjs — the words of the brand that more than one surface prints.
//
// The tagline is the owner's choice for brand H1 (2026-11-26): "We read the docs. You ship the code." To change it
// everywhere, edit TAGLINE (and TAGLINE_KEY, the closing sentence set in the accent colour), then run `npm run build`,
// `npm run og` and `npm run brand-assets`. Nothing else needs editing.
//
// Read by: the home page H1 (scripts/build.mjs, AUTOGEN:tagline in site/index.html), the README (AUTOGEN:tagline),
// the home social image (site/og.svg via lib/og.mjs), the README banner and the GitHub social preview
// (scripts/brand-assets.mjs). scripts/brand.test.mjs checks that each of them carries it.

export const TAGLINE = 'We read the docs. You ship the code.';

/** The closing phrase of TAGLINE that the hero sets in the accent; '' for none. It must be the end of TAGLINE. */
export const TAGLINE_KEY = 'You ship the code.';

/** TAGLINE split at TAGLINE_KEY: [lead, key]. */
export function taglineParts(tagline = TAGLINE, key = TAGLINE_KEY) {
  if (key && tagline.endsWith(key)) return [tagline.slice(0, tagline.length - key.length).trimEnd(), key];
  return [tagline, ''];
}

/** The descriptor under the name where there is room for one line about what this is. */
export const DESCRIPTOR = 'Every free AI API tier, quoted and dated.';
