// html.mjs — the HTML escapers of the build, in one place. Every script that writes HTML (or SVG) imports from here.
//
// All three turn null and undefined into the empty string and anything else into String(value), and always escape `&`
// first so no entity is escaped twice. They differ only in which quote characters they also escape:
//
//   escapeHtml  & < > " '   safe anywhere: text, and attribute values in double or single quotes. The default.
//   escapeAttr  & < > "     text and double-quoted attribute values (every attribute this build writes is double-quoted).
//   escapeText  & < >       text nodes only, e.g. a <pre><code> block whose quotes must stay readable in the source.
//
// escapeAttr and escapeText exist so the generated site stays byte-identical to what the older per-file helpers wrote;
// for new code, use escapeHtml.
//
// Keep escapeHtml self-contained and its body exactly as written: lib/rows.mjs, lib/compare.mjs and lib/find.mjs
// serialise it with toString() into the browser bundles (site/shared-rows.js and friends), so the browser runs the same
// code as the server render, and reformatting it changes those generated files. The modules whose functions are (or are
// meant to be) serialised (rows, compare, find, expiry, flags, aura, stamp) import it as `htmlEsc`, the name those
// function bodies call.

export const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const escapeText = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

export const escapeAttr = (s) => escapeText(s).replace(/"/g, '&quot;');
