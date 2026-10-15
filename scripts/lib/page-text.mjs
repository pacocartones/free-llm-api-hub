// The text of a page, the way every reading of a source is done in this repository: the same function builds the register of quotes and
// re-reads the sources later, so a quote is compared with a page the same way both times.
//
// Method (recorded in each entry of data/quotes.json as `method`):
//   0. the page is requested with READ_HEADERS (English);
//   1. drop <script>, <style>, <noscript>, <template> and <svg> elements and HTML comments;
//   2. replace every other tag by a space;
//   3. decode character references (numeric ones, and the named ones in NAMED; any other named reference is left as it is);
//   4. collapse every run of white space (including no-break spaces) into one space and trim.
// Curly quotes and apostrophes are NOT normalised: a quote is copied as the page spells it.
import { createHash } from 'node:crypto';

export const METHOD = 'html-text-v1: page requested in English, tags removed, character references decoded, white space collapsed';

/** How a page is requested, by the register builder and by the verify script alike. A page that negotiates its language by address or
 * by header (ai.google.dev answered a Spanish copy once) is read in English, which is the language the quotes are in. */
export const READ_HEADERS = { 'User-Agent': 'free-llm-api-hub-quote-reader (+https://github.com/pacocartones/free-llm-api-hub)', 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' };

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', sbquo: '‚', bdquo: '„', laquo: '«', raquo: '»',
  ndash: '–', mdash: '—', hellip: '…', middot: '·', bull: '•', copy: '©', reg: '®', trade: '™', times: '×',
  AMP: '&', LT: '<', GT: '>', QUOT: '"', COPY: '©', REG: '®',
  eacute: 'é', egrave: 'è', aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ouml: 'ö', auml: 'ä',
};

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, ref) => {
    if (ref[0] === '#') {
      const code = ref[1].toLowerCase() === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return Object.prototype.hasOwnProperty.call(NAMED, ref) ? NAMED[ref] : m; // case matters: &Eacute; is not &eacute;
  });
}

export function collapse(s) { return s.replace(/[\s ]+/g, ' ').trim(); }

export function htmlToText(html) {
  const noBlocks = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  return collapse(decodeEntities(noBlocks.replace(/<[^>]*>/g, ' ')));
}

export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** The four words of an absence check: whole words, any case; "plan" also matches "plans". */
export const ABSENCE_TERMS = ['free', 'trial', 'paid', 'plan'];
const TERM_RE = { free: /\bfree\b/gi, trial: /\btrial\b/gi, paid: /\bpaid\b/gi, plan: /\bplans?\b/gi };
export function absenceHits(text) {
  return Object.fromEntries(ABSENCE_TERMS.map((t) => [t, (text.match(TERM_RE[t]) || []).length]));
}

/** The language a response declares for itself: the Content-Language header, else the lang attribute of <html>. null = it does not say. */
export function declaredLanguage(html, contentLanguage) {
  const h = String(contentLanguage || '').split(',')[0].trim();
  if (h) return h;
  const m = /<html\b[^>]*\blang\s*=\s*["']?([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*)/i.exec(html || '');
  return m ? m[1] : null;
}

/** Same language by its first subtag (en-US and en-GB are both "en"). An undeclared language cannot be told apart, so it is accepted. */
export function sameLanguage(expected, declared) {
  if (!declared) return true;
  return String(declared).toLowerCase().split(/[-_]/)[0] === String(expected).toLowerCase().split(/[-_]/)[0];
}

/** What one reading of a source says about one passage. A page in another language is never "expired": the passage may well be there.
 *  - unreachable: no page (an error status, no network, a page with almost no text, as a script-only page gives);
 *  - other_language: a page came, and it declares a language other than the one the passage is in;
 *  - expired: a page came, in the right language, and the passage is no longer in it;
 *  - ok: the passage is in the page.
 * @param {{status?: number, error?: string, html?: string, contentLanguage?: string}} reading */
export function judgeReading(reading, passage, expectedLang = 'en') {
  if (!reading || reading.error || !(reading.status >= 200 && reading.status < 300)) return 'unreachable';
  const text = htmlToText(reading.html || '');
  if (text.length < 200) return 'unreachable';
  if (!sameLanguage(expectedLang, declaredLanguage(reading.html, reading.contentLanguage))) return 'other_language';
  return text.includes(collapse(passage)) ? 'ok' : 'expired';
}
