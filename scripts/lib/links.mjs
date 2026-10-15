// links.mjs — a link that opens a new tab says so to a screen reader (WCAG 3.2.5, advisory; and 2.4.4 link purpose).
//
// markNewTabLinks(html) is applied once, to the finished text of every generated page: inside every <a target="_blank">
// it adds a screen-reader-only "(opens in a new tab)" before the closing tag. Text inside <script> and <style> blocks is
// not touched, and a link that already carries the note is left as it is.

const NOTE = '<span class="sr-only"> (opens in a new tab)</span>';

export function markNewTabLinks(html) {
  return html
    .split(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)/g)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/<a\b([^>]*\btarget="_blank"[^>]*)>([\s\S]*?)<\/a>/g, (m, attrs, inner) => (inner.includes('(opens in a new tab)') ? m : `<a${attrs}>${inner}${NOTE}</a>`))))
    .join('');
}
