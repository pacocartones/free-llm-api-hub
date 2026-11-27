// claims-table.mjs — the table "at a glance" of the sections that list services with the sentences they say about
// themselves (Free GPU compute and Free AI coding tools). One row per service, one column per point; a cell says
// "Stated" when the service's own page says it and "Not stated" when it does not, which is never "no". Nothing
// is filled in, ranked or summed: the sentences stay in the entries below, and every row links to its entry.
//
// The filters need no script: checkboxes and radios that site/tables.css reads with :has(). Only the filters that
// tell the services apart are offered (a point that every service states, or none does, filters nothing), and a
// browser without :has() simply shows the whole table.

import { escapeHtml } from './html.mjs';
import { SLUG_RE } from './rows.mjs';

/** The filters worth offering for these entries: fields that some state and some do not, and the kinds if there are two or more. */
export function claimsFilters(entries, labels) {
  const fields = Object.keys(labels).filter((f) => {
    const n = entries.filter((e) => e.claims[f] && e.claims[f].state === 'stated').length;
    return n > 0 && n < entries.length;
  });
  const kinds = [...new Set(entries.map((e) => e.kind))];
  return { fields, kinds: kinds.length > 1 ? kinds : [] };
}

// `label` names the scrolling region; a page with two tables of the same subject passes its own, so the two landmarks
// do not share one name (axe landmark-unique).
export function claimsTableHtml({ id, entries, labels, kindLabel, subject, label = '' }) {
  if (!entries || entries.length < 2) return '';
  const allFields = Object.keys(labels);
  const stateCount = (f) => entries.filter((e) => e.claims[f] && e.claims[f].state === 'stated').length;
  // A point that no service states is not a column of "Not stated" repeated on every row: it is said once, under the table.
  const fields = allFields.filter((f) => stateCount(f) > 0);
  const none = allFields.filter((f) => stateCount(f) === 0);
  const { fields: filterFields, kinds } = claimsFilters(entries, labels);
  // "Stated" links to the sentence itself (the claim block of the entry); "Not stated" has nothing to link to
  // The state is the class of the cell (s: stated, n: not stated), not a span in every cell: the page is mostly cells.
  const cell = (e, f) => (e.claims[f] && e.claims[f].state === 'stated'
    ? `<td class="s">${SLUG_RE.test(e.slug) ? `<a href="#${e.slug}-${f}">Stated</a>` : 'Stated'}</td>`
    : '<td class="n">Not stated</td>');
  const filters = (filterFields.length || kinds.length)
    ? `<fieldset class="cmp-filters"><legend>Show only</legend>` +
      (kinds.length
        ? `<span class="cmp-group" role="radiogroup" aria-label="Kind of ${escapeHtml(subject)}">` +
          `<label><input type="radio" name="${id}-kind" value="" checked> All kinds</label>` +
          kinds.map((k) => `<label><input type="radio" name="${id}-kind" value="${escapeHtml(k)}"> ${escapeHtml(kindLabel(k))}</label>`).join('') + `</span>`
        : '') +
      (filterFields.length
        ? `<span class="cmp-group">` +
          filterFields.map((f) => `<label><input type="checkbox" name="${id}-state" value="${escapeHtml(f)}"> ${escapeHtml(labels[f])} stated</label>`).join('') + `</span>`
        : '') +
      `</fieldset>`
    : '';
  const rows = entries.map((e) => {
    const stated = allFields.filter((f) => e.claims[f] && e.claims[f].state === 'stated').join(' ');
    const anchor = SLUG_RE.test(e.slug) ? `<a href="#${e.slug}">${escapeHtml(e.name)}</a>` : escapeHtml(e.name);
    return `<tr data-kind="${escapeHtml(e.kind)}" data-stated="${escapeHtml(stated)}"><th scope="row">${anchor}</th><td>${escapeHtml(kindLabel(e.kind))}</td>` +
      fields.map((f) => cell(e, f)).join('') + `</tr>`;
  }).join('');
  return `<div class="cmp" id="${id}-glance"><h3>At a glance</h3>` +
    `<p class="muted">One row per ${escapeHtml(subject)}. <strong>Stated</strong> means the page's own sentence says it, and the cell links to that sentence in the entry below; ` +
    `<strong>Not stated</strong> is never <em>no</em>. ${filterFields.length > 1 ? `If the filters leave no row, no ${escapeHtml(subject)} states all of the points you chose.` : ''}</p>` +
    filters +
    `<div class="table-scroll" role="region" aria-label="${escapeHtml(label || `Comparison of the ${subject}s`)}" tabindex="0">` +
    `<table class="cmp-table"><caption class="sr-only">What each ${escapeHtml(subject)} says about each point</caption>` +
    `<thead><tr><th scope="col">${escapeHtml(subject[0].toUpperCase() + subject.slice(1))}</th><th scope="col">Kind</th>` +
    fields.map((f) => `<th scope="col">${escapeHtml(labels[f])}</th>`).join('') + `</tr></thead><tbody>${rows}</tbody></table></div>` +
    (none.length ? `<p class="muted">No ${escapeHtml(subject)} states: ${none.map((f) => escapeHtml(labels[f].toLowerCase())).join(', ')}. That is <strong>Not stated</strong>, never <em>no</em>; each entry below says what its page does say.</p>` : '') + `</div>`;
}
