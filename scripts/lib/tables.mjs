// tables.mjs — every generated data table names itself and its headers (WCAG 1.3.1, 2.4.6).
//
// labelTables(html) is applied once, to the finished text of every generated page. A table without a <caption>
// gets a screen-reader caption taken from the nearest heading above it (or "Table" when there is none); a header
// cell gets scope="col" when its row holds only headers and scope="row" when the row also has data cells.
// A table that already has a caption, and a header that already has a scope, are left as they are.

const stripTags = (s) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function scopeRows(inner) {
  return inner.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/g, (tr) => {
    const onlyHeaders = !/<td\b/.test(tr);
    return tr.replace(/<th\b([^>]*)>/g, (m, attrs) => (/\bscope\s*=/.test(attrs) ? m : `<th scope="${onlyHeaders ? 'col' : 'row'}"${attrs}>`));
  });
}

export function labelTables(html) {
  return html.replace(/<table\b([^>]*)>([\s\S]*?)<\/table>/g, (whole, attrs, inner, offset) => {
    let body = scopeRows(inner);
    if (!/<caption\b/.test(body)) {
      const heads = [...html.slice(0, offset).matchAll(/<h([1-2])\b[^>]*>([\s\S]*?)<\/h\1>/g)];
      const text = heads.length ? stripTags(heads[heads.length - 1][2]) : '';
      body = `<caption class="sr-only">${text || 'Table'}</caption>${body}`;
    }
    return `<table${attrs}>${body}</table>`;
  });
}
