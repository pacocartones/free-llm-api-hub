// claims-table.mjs — the table "at a glance" of the sections that list services with the sentences they say about
// themselves (Free GPU compute and Free AI coding tools). One row per service, one column per point; a cell says
// "Stated" when the service's own page says it and "Not stated" when it does not, which is never "no". Nothing
// is filled in, ranked or summed: the sentences stay in the entries below, and every row links to its entry.
//
// The filters need no script: checkboxes and radios that site/tables.css reads with :has(). Only the filters that
// tell the services apart are offered (a point that every service states, or none does, filters nothing), and a
// browser without :has() simply shows the whole table.

import { htmlEsc, SLUG_RE } from './rows.mjs';

/** The filters worth offering for these entries: fields that some state and some do not, and the kinds if there are two or more. */
export function claimsFilters(entries, labels) {
  const fields = Object.keys(labels).filter((f) => {
    const n = entries.filter((e) => e.claims[f] && e.claims[f].state === 'stated').length;
    return n > 0 && n < entries.length;
  });
  const kinds = [...new Set(entries.map((e) => e.kind))];
  return { fields, kinds: kinds.length > 1 ? kinds : [] };
}

export function claimsTableHtml({ id, entries, labels, kindLabel, subject }) {
  if (!entries || entries.length < 2) return '';
  const fields = Object.keys(labels);
  const { fields: filterFields, kinds } = claimsFilters(entries, labels);
  const cell = (e, f) => (e.claims[f] && e.claims[f].state === 'stated'
    ? '<span class="gpu-stated">Stated</span>'
    : '<span class="gpu-unstated">Not stated</span>');
  const filters = (filterFields.length || kinds.length)
    ? `<fieldset class="cmp-filters"><legend>Show only</legend>` +
      (kinds.length
        ? `<span class="cmp-group" role="radiogroup" aria-label="Kind of ${htmlEsc(subject)}">` +
          `<label><input type="radio" name="${id}-kind" value="" checked> All kinds</label>` +
          kinds.map((k) => `<label><input type="radio" name="${id}-kind" value="${htmlEsc(k)}"> ${htmlEsc(kindLabel(k))}</label>`).join('') + `</span>`
        : '') +
      (filterFields.length
        ? `<span class="cmp-group">` +
          filterFields.map((f) => `<label><input type="checkbox" name="${id}-state" value="${htmlEsc(f)}"> ${htmlEsc(labels[f])} stated</label>`).join('') + `</span>`
        : '') +
      `</fieldset>`
    : '';
  const rows = entries.map((e) => {
    const stated = fields.filter((f) => e.claims[f] && e.claims[f].state === 'stated').join(' ');
    const anchor = SLUG_RE.test(e.slug) ? `<a href="#${e.slug}">${htmlEsc(e.name)}</a>` : htmlEsc(e.name);
    return `<tr data-kind="${htmlEsc(e.kind)}" data-stated="${htmlEsc(stated)}"><th scope="row">${anchor}</th><td>${htmlEsc(kindLabel(e.kind))}</td>` +
      fields.map((f) => `<td>${cell(e, f)}</td>`).join('') + `</tr>`;
  }).join('');
  return `<div class="cmp" id="${id}-glance"><h3>At a glance</h3>` +
    `<p class="muted">One row per ${htmlEsc(subject)}. <strong>Stated</strong> means the page's own sentence says it, shown in the entry below; ` +
    `<strong>Not stated</strong> is never <em>no</em>. ${filterFields.length > 1 ? `If the filters leave no row, no ${htmlEsc(subject)} states all of the points you chose.` : ''}</p>` +
    filters +
    `<div class="table-scroll" role="region" aria-label="Comparison of the ${htmlEsc(subject)}s" tabindex="0">` +
    `<table class="cmp-table"><caption class="sr-only">What each ${htmlEsc(subject)} says about each point</caption>` +
    `<thead><tr><th scope="col">${htmlEsc(subject[0].toUpperCase() + subject.slice(1))}</th><th scope="col">Kind</th>` +
    fields.map((f) => `<th scope="col">${htmlEsc(labels[f])}</th>`).join('') + `</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
