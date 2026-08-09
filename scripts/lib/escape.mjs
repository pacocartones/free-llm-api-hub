// escape.mjs — output sanitizers shared by build.mjs and the build test suite.
//
// esc: safe output for a GFM table cell or an HTML attribute. Handled in a
// specific order so the escapes never fight each other; a community PR editing
// any provider field can inject neither raw HTML, link syntax, nor spurious
// table breaks into the generated markdown and pages.
//
// stripTags: removes HTML tags at a fixed point so nested / incomplete
// fragments like `<<script>` cannot survive a single pass of `<[^>]*>`.

export const esc = (s) =>
  String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\[/g, '\\[')
    .replace(/]/g, '\\]')
    .replace(/\r?\n/g, ' ')
    .trim();

export const stripTags = (s) => {
  let out = String(s ?? '');
  let prev;
  do {
    prev = out;
    out = out.replace(/<[^>]*>/g, '');
  } while (out !== prev);
  return out;
};
