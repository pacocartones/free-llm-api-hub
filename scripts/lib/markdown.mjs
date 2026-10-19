// markdown.mjs — a small markdown-to-HTML converter with no dependency, for the two documents the site publishes
// (docs/methodology.md and CONTRIBUTING.md). It knows what those documents use: headings, paragraphs, bullet and numbered
// lists (nested), fenced code, block quotes, pipe tables, rules, and inline code, bold, italic and links.
//
// Safe by construction: nothing of the source is ever passed through as HTML. Every character is escaped, there is no
// raw-HTML and no image syntax, and a link is only written when its target is http(s), a page of this site, or a path of
// the repository (which becomes a GitHub URL); anything else (javascript:, data:, ...) is left as plain text.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/** GitHub's heading id: lowercase, drop what is not a letter, digit, space, hyphen or underscore, spaces become hyphens. */
export const headingId = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');

/**
 * links: { repo, site, pages } — repo: the GitHub repository URL; site: the site origin;
 * pages: { 'CONTRIBUTING.md': '/contributing/', ... } files of the repository that have a page on the site.
 * Returns { href, external } or null when the target must not become a link.
 */
export const resolveLink = (target, { repo, site, pages = {}, from = '' }) => {
  const t = target.trim();
  if (!t) return null;
  if (t.startsWith('#')) return /^#[\p{L}\p{N}_-]+$/u.test(t) ? { href: t, external: false } : null;
  if (/^https?:\/\//i.test(t)) {
    try { const u = new URL(t); return { href: u.href, external: u.origin !== site }; } catch { return null; }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('//')) return null; // javascript:, data:, mailto: ... are not links here
  // A relative path of the repository: resolve it against the folder of the document.
  const [pathPart, hash = ''] = t.split('#');
  const [pathOnly, query = ''] = pathPart.split('?');
  const parts = (from ? from.split('/').slice(0, -1) : []);
  for (const seg of pathOnly.split('/')) {
    if (seg === '..') { if (parts.length) parts.pop(); else parts.push('..'); } else if (seg && seg !== '.') parts.push(seg);
  }
  if (parts[0] === '..') {
    // ../../issues/new?template=x.yml, as written for a page one level down in GitHub: it is the issues of the repository
    const rest = parts.filter((s) => s !== '..').join('/');
    return rest.startsWith('issues') ? { href: `${repo}/${rest}${query ? '?' + query : ''}`, external: true } : null;
  }
  const rel = parts.join('/');
  if (pages[rel]) return { href: pages[rel] + (hash ? '#' + hash : ''), external: false };
  return { href: `${repo}/blob/main/${rel}${hash ? '#' + hash : ''}`, external: true };
};

const matchLink = (s, i) => {
  let depth = 0, j = i;
  for (; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === '[') depth++;
    else if (s[j] === ']') { depth--; if (depth === 0) break; }
  }
  if (j >= s.length || s[j + 1] !== '(') return null;
  let k = j + 2, p = 1;
  for (; k < s.length; k++) {
    if (s[k] === '(') p++;
    else if (s[k] === ')') { p--; if (p === 0) break; }
  }
  if (k >= s.length) return null;
  return { text: s.slice(i + 1, j), url: s.slice(j + 2, k), end: k + 1 };
};

export const inlineHtml = (s, ctx) => {
  let out = '';
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '`') {
      const j = s.indexOf('`', i + 1);
      if (j > i) { out += `<code>${escHtml(s.slice(i + 1, j))}</code>`; i = j + 1; continue; }
    }
    if (c === '\\' && i + 1 < s.length && /[\\`*_{}[\]()#+\-.!|<>]/.test(s[i + 1])) { out += escHtml(s[i + 1]); i += 2; continue; }
    if (c === '[') {
      const m = matchLink(s, i);
      if (m) {
        const inner = inlineHtml(m.text, ctx);
        const r = resolveLink(m.url, ctx);
        out += r ? `<a href="${escHtml(r.href)}"${r.external ? ' target="_blank" rel="noopener"' : ''}>${inner}</a>` : inner;
        i = m.end; continue;
      }
    }
    if (s.startsWith('**', i)) {
      const j = s.indexOf('**', i + 2);
      if (j > i + 2) { out += `<strong>${inlineHtml(s.slice(i + 2, j), ctx)}</strong>`; i = j + 2; continue; }
    }
    if (c === '*' && s[i + 1] && s[i + 1] !== ' ' && s[i + 1] !== '*') {
      let j = i + 1;
      while (j < s.length && !(s[j] === '*' && s[j - 1] !== ' ' && s[j + 1] !== '*')) j++;
      if (j < s.length && j > i + 1) { out += `<em>${inlineHtml(s.slice(i + 1, j), ctx)}</em>`; i = j + 1; continue; }
    }
    out += escHtml(c); i++;
  }
  return out;
};

const isFence = (l) => /^\s*```/.test(l);
const isHeading = (l) => /^#{1,6}\s+\S/.test(l);
const isRule = (l) => /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l);
const isQuote = (l) => /^\s*>/.test(l);
const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const bullet = (l) => l.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
const splitRow = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

const listHtml = (lines, ctx) => {
  const first = bullet(lines[0]);
  const base = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items = [];
  for (let i = 0; i < lines.length;) {
    const b = bullet(lines[i]);
    if (!b || b[1].length !== base) { i++; continue; }
    let text = b[3];
    const kids = [];
    i++;
    while (i < lines.length) {
      const nb = bullet(lines[i]);
      if (nb && nb[1].length <= base) break;
      if (nb) kids.push(lines[i]);
      else if (kids.length) kids.push(lines[i]);
      else text += ' ' + lines[i].trim();
      i++;
    }
    items.push(`<li>${inlineHtml(text, ctx)}${kids.length ? listHtml(kids, ctx) : ''}</li>`);
  }
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${items.join('')}</${tag}>`;
};

/** Converts a markdown document; headings get GitHub's ids, each id once. Options: see resolveLink, plus `from`: the path of the document. */
export const markdownToHtml = (md, ctx) => {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const used = new Map();
  const blocks = [];
  const render = (ls) => {
    const out = [];
    for (let i = 0; i < ls.length;) {
      const l = ls[i];
      if (!l.trim()) { i++; continue; }
      if (isFence(l)) {
        const body = []; i++;
        while (i < ls.length && !isFence(ls[i])) body.push(ls[i++]);
        i++;
        out.push(`<pre><code>${escHtml(body.join('\n'))}</code></pre>`); continue;
      }
      if (isHeading(l)) {
        const [, hashes, text] = l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
        let id = headingId(text.replace(/[`*]/g, ''));
        const n = used.get(id) || 0; used.set(id, n + 1);
        if (n) id += `-${n}`;
        out.push(`<h${hashes.length} id="${escHtml(id)}">${inlineHtml(text, ctx)}</h${hashes.length}>`); i++; continue;
      }
      if (isRule(l)) { out.push('<hr>'); i++; continue; }
      if (isQuote(l)) {
        const q = [];
        while (i < ls.length && isQuote(ls[i])) q.push(ls[i++].replace(/^\s*>\s?/, ''));
        out.push(`<blockquote>${render(q)}</blockquote>`); continue;
      }
      if (isTableRow(l) && i + 1 < ls.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(ls[i + 1])) {
        const head = splitRow(l); i += 2;
        const rows = [];
        while (i < ls.length && isTableRow(ls[i])) rows.push(splitRow(ls[i++]));
        out.push(`<div class="table-wrap"><table class="model-table"><thead><tr>${head.map((c) => `<th>${inlineHtml(c, ctx)}</th>`).join('')}</tr></thead><tbody>` +
          rows.map((r) => `<tr>${r.map((c) => `<td>${inlineHtml(c, ctx)}</td>`).join('')}</tr>`).join('') + `</tbody></table></div>`); continue;
      }
      if (bullet(l)) {
        const list = [];
        while (i < ls.length && (bullet(ls[i]) || (ls[i].trim() && /^\s+/.test(ls[i]) && list.length) || (!ls[i].trim() && i + 1 < ls.length && bullet(ls[i + 1])))) {
          if (ls[i].trim()) list.push(ls[i]);
          i++;
        }
        out.push(listHtml(list, ctx)); continue;
      }
      const para = [];
      while (i < ls.length && ls[i].trim() && !isFence(ls[i]) && !isHeading(ls[i]) && !isQuote(ls[i]) && !isRule(ls[i]) && !bullet(ls[i])) para.push(ls[i++].trim());
      out.push(`<p>${inlineHtml(para.join(' '), ctx)}</p>`);
    }
    return out.join('\n');
  };
  blocks.push(render(lines));
  return blocks.join('\n');
};
