// text.mjs — small text helpers shared by the page generators.
//
// safeHttp: the URL itself when it is http(s), otherwise ''. The data is
// validated upstream; this keeps a javascript: or data: value out of an href
// even if one slipped through. The result is raw: HTML-escape it when writing
// it into an attribute, or use safeUrl, which does both.
//
// plural: "1 provider", "3 providers"; pass `many` for irregular plurals.
//
// Not for code that is shipped to the browser as source text (rows.mjs,
// compare.mjs, find.mjs clientBundle): those functions cannot import.
import { escapeHtml } from './html.mjs';

export const safeHttp = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');

export const safeUrl = (u) => (safeHttp(u) ? escapeHtml(u) : '');

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
