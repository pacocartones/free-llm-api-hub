// model-index.mjs — the free model index at /models/: the answer-first line and the model table.
//
// One row per (model ID, provider) pair from every provider's `models_free`. The table keeps real table semantics
// (caption, column headers with scope, explicit ARIA roles so a phone layout that sets `display: block` does not
// drop them) inside a keyboard-focusable scroll region, the pattern of the Markdown tables (#934). Under 560px the
// rows turn into stacked cards (site/styles.css, `.model-table`): each cell then carries its column name in
// `data-label`, shown as a visual-only label, so "Free type" and "Modalities" get the whole card width and words no
// longer break in the middle.
//
// A model that belongs to one of the open families (lib/model-families.mjs) links to its /free-api/<family>/ page.
//
// Pure: build.mjs passes the providers, the model groups and the page links; the tests call the same code.

import { escapeHtml as htmlEsc } from './html.mjs';
import { modelKey } from './model-keys.mjs';
import { familyOf, FAMILY_PATH } from './model-families.mjs';
import { FREE_TYPE_LABEL } from './model-pages.mjs';
import { andList } from './long-guides.mjs';
import { plural } from './text.mjs';
import { NOT_STATED } from './not-stated.mjs';

/** The four columns, in order. `data-label` on each cell repeats them for the phone card layout. */
export const MODEL_INDEX_COLUMNS = Object.freeze(['Model', 'Provider', 'Free type', 'Modalities']);

/** Every (model ID, provider) pair, sorted by model ID (case-insensitive), then provider name. */
export function modelIndexRows(providers) {
  const rows = [];
  for (const p of providers || []) for (const m of (p.models_free || [])) rows.push({ m, p });
  return rows.sort((a, b) => a.m.toLowerCase().localeCompare(b.m.toLowerCase()) || a.p.name.localeCompare(b.p.name));
}

/**
 * The figures behind the answer-first line: distinct models (grouped by modelKey, an ID with no key counts on its
 * own), providers with at least one free model, and the `top` model groups served by the most providers (ties by
 * name, so the line is the same on every build).
 */
export function modelIndexStats(providers, groups, top = 3) {
  const distinct = new Set();
  for (const { m } of modelIndexRows(providers)) distinct.add(modelKey(m) ?? `id:${m.toLowerCase()}`);
  const providerCount = (providers || []).filter((p) => p.models_free && p.models_free.length).length;
  const widest = [...(groups || [])]
    .filter((g) => g.entries.length >= 2)
    .sort((a, b) => b.entries.length - a.entries.length || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, top)
    .map((g) => ({ key: g.key, name: g.name, providers: g.entries.length }));
  return { models: distinct.size, providers: providerCount, widest };
}

/** "N models free across M providers; most widely available: A (5 providers), B (4) and C (4)." as plain text. */
export function modelIndexAnswer(stats) {
  const head = `${plural(stats.models, 'model')} free across ${plural(stats.providers, 'provider')}`;
  if (!stats.widest.length) return `${head}.`;
  const parts = stats.widest.map((w, i) => `${w.name} (${i === 0 ? plural(w.providers, 'provider') : w.providers})`);
  return `${head}; most widely available: ${andList(parts)}.`;
}

/** The same line as HTML, each widely-available model linked to its /models/<key>/ page. */
export function modelIndexAnswerHtml(stats) {
  const head = `${plural(stats.models, 'model')} free across ${plural(stats.providers, 'provider')}`;
  if (!stats.widest.length) return `<p class="answer"><strong>${head}.</strong></p>`;
  const parts = stats.widest.map((w, i) => `<a href="${htmlEsc(w.key)}/">${htmlEsc(w.name)}</a> (${i === 0 ? plural(w.providers, 'provider') : w.providers})`);
  return `<p class="answer"><strong>${head}; most widely available: ${andList(parts)}.</strong></p>`;
}

const cell = (label, inner, cls = '') => `<td${cls ? ` class="${cls}"` : ''} role="cell" data-label="${htmlEsc(label)}">${inner}</td>`;

/**
 * One row. `modelHref(id)` gives the /models/<key>/ link or ''; `familyPrefix` is the path to the site root used
 * for the /free-api/<family>/ link; `families` are the family pages that exist.
 */
export function modelIndexRowHtml({ m, p }, { modelHref = () => '', familyPrefix = '../', families = [] } = {}) {
  const href = modelHref(m);
  const code = `<code>${htmlEsc(m)}</code>`;
  const f = familyOf(m);
  const famPage = f && families.some((g) => g.slug === f.slug)
    ? `<a class="model-fam" href="${familyPrefix}${FAMILY_PATH}${f.slug}/">${htmlEsc(f.name)} family</a>`
    : '';
  const mods = (p.modalities || []).join(', ');
  const freeType = FREE_TYPE_LABEL[p.free_type] || p.free_type || NOT_STATED;
  const search = `${m} ${p.name} ${(p.modalities || []).join(' ')}${f ? ` ${f.name}` : ''}`.toLowerCase();
  return `<tr role="row" data-s="${htmlEsc(search)}">` +
    `<th scope="row" role="rowheader" class="name" data-label="${MODEL_INDEX_COLUMNS[0]}">${href ? `<a href="${htmlEsc(href)}">${code}</a>` : code}${famPage}</th>` +
    cell(MODEL_INDEX_COLUMNS[1], `<a href="../p/${htmlEsc(p.slug)}">${htmlEsc(p.name)}</a>`) +
    cell(MODEL_INDEX_COLUMNS[2], htmlEsc(freeType), 'free-type') +
    cell(MODEL_INDEX_COLUMNS[3], htmlEsc(mods || NOT_STATED), 'model-mods') +
    `</tr>`;
}

/** The whole table inside its keyboard-focusable scroll region. */
export function modelIndexTableHtml(rows, opts = {}) {
  const head = MODEL_INDEX_COLUMNS.map((c) => `<th scope="col" role="columnheader">${c}</th>`).join('');
  return `<div class="table-scroll model-scroll" role="region" aria-label="Free models and the providers that serve them" tabindex="0">` +
    `<table class="model-table" role="table"><caption class="sr-only">Free models, the provider that serves each, its free type and modalities</caption>` +
    `<thead role="rowgroup"><tr role="row">${head}</tr></thead><tbody role="rowgroup">\n` +
    rows.map((r) => modelIndexRowHtml(r, opts)).join('\n') +
    `\n</tbody></table></div>`;
}

/** The meta description: leads with "free AI models API" and the figures, at most `max` characters. */
export function modelIndexDescription(stats, max = 155) {
  const base = `Free AI models API index: ${plural(stats.models, 'model')} free across ${plural(stats.providers, 'provider')}, and which free API serves each`;
  const top = stats.widest.slice(0, 2).map((w) => w.name);
  const withTop = top.length ? `${base}. Most widely available: ${andList(top)}.` : `${base}.`;
  return withTop.length <= max ? withTop : `${base}.`.slice(0, max);
}
