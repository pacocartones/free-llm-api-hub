// dates.mjs — the one place a date is read, computed or written.
//
// Two formats, and only two:
//   human    "24 Nov 2026" (day, short English month, year), in every page, the README and the docs a person reads.
//            In HTML it goes inside <time datetime="2026-11-24">, so the machine-readable day stays on the element.
//   machine  ISO "2026-11-24", in JSON, the API, CSV, JSON-LD, sitemaps, feeds, llms.txt and the .md mirrors.
// A month on its own (the monthly state pages) is "November 2026".
//
// humanDate, DATE_MONTHS and DATE_RE are shipped to the browser as source text (rows.clientBundle), so keep
// humanDate self-contained: it may only use DATE_MONTHS.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const DATE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-11-24" → "24 Nov 2026" ("24 Nov" when withYear is false). Anything that is not an ISO day → null. */
export function humanDate(iso, withYear) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso == null ? '' : iso));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return Number(m[3]) + ' ' + DATE_MONTHS[Number(m[2]) - 1] + (withYear === false ? '' : ' ' + m[1]);
}

/** Text with every ISO day in it written the human way: "checked 2026-11-24" → "checked 24 Nov 2026". */
export const humanDates = (text) => String(text ?? '').replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (d) => humanDate(d) || d);

/**
 * An ISO day as HTML: <time datetime="2026-11-24">24 Nov 2026</time>. `esc` escapes text that is not an ISO day
 * (it is returned escaped as it is); the caller passes its own escaper so this module stays dependency-free.
 */
export const timeHtml = (iso, esc = (s) => String(s)) => {
  const h = humanDate(iso);
  return h ? `<time datetime="${iso}">${h}</time>` : esc(String(iso ?? ''));
};

/** "2026-11" → "November"; monthLabel → "November 2026"; shortMonthLabel → "Nov 2026" (page titles). */
export const monthName = (month) => MONTH_NAMES[Number(String(month).slice(5, 7)) - 1];
export const monthLabel = (month) => `${monthName(month)} ${String(month).slice(0, 4)}`;
export const shortMonthLabel = (month) => `${DATE_MONTHS[Number(String(month).slice(5, 7)) - 1]} ${String(month).slice(0, 4)}`;

/** The last calendar day of a YYYY-MM month, as YYYY-MM-DD. */
export const monthEndDate = (month) => {
  const [y, m] = String(month).split('-').map(Number);
  return isoDay(Date.UTC(y, m, 0));
};

/** A Date or a timestamp in ms → its ISO day in UTC. */
export const isoDay = (d) => new Date(d).toISOString().slice(0, 10);

/** Today's day in UTC, YYYY-MM-DD. `override` (VALIDATE_TODAY and friends in the tests) fixes it. */
export const utcToday = (override) => override || isoDay(Date.now());
