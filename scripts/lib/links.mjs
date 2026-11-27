// links.mjs — a link that opens a new tab says so to a screen reader (WCAG 3.2.5, advisory; and 2.4.4 link purpose).
//
// markNewTabLinks(html) is applied once, to the finished text of every generated page: inside every <a target="_blank">
// it adds a screen-reader-only "(opens in a new tab)" before the closing tag. Text inside <script> and <style> blocks is
// not touched, and a link that already carries the note is left as it is.

const LABEL = '(opens in a new tab)';

/** `label` is the note in the page's language (the Spanish pages pass their own, docs/i18n.md). */
export function markNewTabLinks(html, label = LABEL) {
  const NOTE = `<span class="sr-only"> ${label}</span>`;
  return html
    .split(/(<script\b[\s\S]*?<\/script\b[^>]*>|<style\b[\s\S]*?<\/style\b[^>]*>)/gi)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/<a\b([^>]*\btarget="_blank"[^>]*)>([\s\S]*?)<\/a>/g, (m, attrs, inner) => (inner.includes(label) ? m : `<a${attrs}>${inner}${NOTE}</a>`))))
    .join('');
}
