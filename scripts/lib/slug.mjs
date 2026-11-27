// slug.mjs — the kebab-case identifier rule shared by the dataset checks and the renderers.
//
// A data module: no markup, no file access. rows.mjs re-exports it (its client bundle serialises it with toString()), so the
// validators can use the rule without reaching the HTML renderers.

// slugs are kebab-case identifiers, enforced by data/schema.json in CI; re-check
// here because the client fetch path bypasses that guarantee.
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
