// state-charts.mjs — the charts of the quarterly report as inline SVG, written at build time. No client script and no
// library: each chart is a horizontal bar chart (grouped or stacked) drawn from ONE spec object, and the same object
// writes the data table under it, so the picture and the table cannot disagree (scripts/state-quarterly.test.mjs reads
// both back from the built page and compares them).
//
// Colours are classes (site/charts.css), each mapped to an existing token of styles.css (--ok, --bad, --unk, --faint,
// --accent, --text, --muted, --border), so the charts follow the light and dark themes and the coming restyle without
// a change here. Each value is also written as a number at the end of its bar or in the table: colour is never the
// only way to read a value.
//
// Accessibility: <figure> with a visible caption; the <svg> is role="img", named by its <title> and described by its
// <desc> (a one-sentence summary written from the data); the full numbers are in a real <table> in a <details> under it.

import { escHtml as esc } from './markdown.mjs';

export const SERIES_CLASSES = Object.freeze(['c-ok', 'c-bad', 'c-unk', 'c-before', 'c-accent']);

// Two layouts from the same spec. `wide`: labels left of the bars, 640 units across, shown from 560px up. `narrow`:
// each label on its own line above its bars, 340 units across, so the text stays about 13px on a phone. CSS shows one
// (display: none takes the other out of the accessibility tree too, so a screen reader meets one chart, not two).
export const LAYOUTS = Object.freeze({
  wide: Object.freeze({ W: 640, LABEL_W: 200, labelAbove: false }),
  narrow: Object.freeze({ W: 340, LABEL_W: 0, labelAbove: true }),
});
// The longest category label that fits left of the bars at 13px in the wide layout (checked by validateChart).
export const MAX_LABEL = 26;
const VALUE_W = 48;
const LEGEND_LINE = 22;
const LABEL_LINE = 18;
const BAR_H = 16;
const GAP_IN = 4;
const GAP_ROW = 14;

const num = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));

/**
 * spec: { id, title, summary, categories: [string], series: [{ name, cls, values: [number] }], stacked?: boolean,
 *         categoryHeader?: string, note?: string }
 * Values are non-negative counts. A stacked chart draws one bar per category and adds a Total column to the table.
 */
export const validateChart = (spec) => {
  const errors = [];
  if (!/^[a-z0-9-]+$/.test(spec.id || '')) errors.push(`chart id ${JSON.stringify(spec.id)} must be lowercase letters, digits and hyphens`);
  if (!spec.title || !spec.summary) errors.push(`${spec.id}: a chart needs a title and a summary`);
  if (!spec.categories?.length || !spec.series?.length) errors.push(`${spec.id}: a chart needs categories and series`);
  for (const c of spec.categories || []) if (String(c).length > MAX_LABEL) errors.push(`${spec.id}: category label ${JSON.stringify(c)} is longer than ${MAX_LABEL} characters`);
  for (const s of spec.series || []) {
    if (s.values.length !== spec.categories.length) errors.push(`${spec.id}: series ${s.name} has ${s.values.length} values for ${spec.categories.length} categories`);
    if (s.values.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0)) errors.push(`${spec.id}: series ${s.name} has a value that is not a non-negative number`);
    if (!SERIES_CLASSES.includes(s.cls)) errors.push(`${spec.id}: series ${s.name} has an unknown colour class ${s.cls}`);
  }
  return errors;
};

const totals = (spec) => spec.categories.map((_, i) => spec.series.reduce((n, s) => n + s.values[i], 0));

export const chartSvg = (spec, layout = 'wide') => {
  const errors = validateChart(spec);
  if (errors.length) throw new Error(errors.join('; '));
  const { W, LABEL_W, labelAbove } = LAYOUTS[layout];
  const BAR_W = W - LABEL_W - VALUE_W;
  const stacked = !!spec.stacked;
  const perRow = stacked ? 1 : spec.series.length;
  const barsH = perRow * BAR_H + (perRow - 1) * GAP_IN;
  const rowH = barsH + (labelAbove ? LABEL_LINE : 0);
  const max = Math.max(1, ...(stacked ? totals(spec) : spec.series.flatMap((s) => s.values)));
  const scale = (v) => (v / max) * BAR_W;
  const sfx = layout === 'wide' ? '' : `-${layout}`;
  const titleId = `${spec.id}${sfx}-title`, descId = `${spec.id}${sfx}-desc`;

  // Legend: a swatch and the series name, in the order of the bars, wrapping onto a new line when it runs out of width.
  let lx = 0, ly = 0;
  const legend = spec.series.map((s) => {
    const w = 18 + s.name.length * 6.6 + 20;
    if (lx > 0 && lx + w - 20 > W) { lx = 0; ly += LEGEND_LINE; }
    const item = `<g transform="translate(${lx},${ly + 6})"><rect class="${s.cls}" width="12" height="12" rx="2"/><text class="ch-legend" x="18" y="11">${esc(s.name)}</text></g>`;
    lx += w;
    return item;
  }).join('');
  const legendH = ly + LEGEND_LINE + 8;
  const height = legendH + spec.categories.length * (rowH + GAP_ROW) + 4;

  const rows = spec.categories.map((cat, i) => {
    const top = legendH + i * (rowH + GAP_ROW);
    const y0 = top + (labelAbove ? LABEL_LINE : 0);
    const label = labelAbove
      ? `<text class="ch-label" x="0" y="${top + 13}">${esc(cat)}</text>`
      : `<text class="ch-label" x="${LABEL_W - 10}" y="${y0 + barsH / 2 + 4.5}" text-anchor="end">${esc(cat)}</text>`;
    let bars = '';
    if (stacked) {
      let x = LABEL_W;
      for (const s of spec.series) {
        const w = scale(s.values[i]);
        bars += `<rect class="${s.cls}" x="${x.toFixed(1)}" y="${y0}" width="${w.toFixed(1)}" height="${BAR_H}" data-series="${esc(s.name)}" data-category="${esc(cat)}" data-value="${s.values[i]}"><title>${esc(cat)}, ${esc(s.name)}: ${num(s.values[i])}</title></rect>`;
        x += w;
      }
      bars += `<text class="ch-value" x="${(x + 6).toFixed(1)}" y="${y0 + BAR_H / 2 + 4.5}">${num(totals(spec)[i])}</text>`;
    } else {
      spec.series.forEach((s, j) => {
        const y = y0 + j * (BAR_H + GAP_IN);
        const w = scale(s.values[i]);
        bars += `<rect class="${s.cls}" x="${LABEL_W}" y="${y}" width="${w.toFixed(1)}" height="${BAR_H}" data-series="${esc(s.name)}" data-category="${esc(cat)}" data-value="${s.values[i]}"><title>${esc(cat)}, ${esc(s.name)}: ${num(s.values[i])}</title></rect>` +
          `<text class="ch-value" x="${(LABEL_W + w + 6).toFixed(1)}" y="${y + BAR_H / 2 + 4.5}">${num(s.values[i])}</text>`;
      });
    }
    return `<g>${label}${bars}</g>`;
  }).join('');

  return `<svg class="chart-svg chart-${layout}" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-labelledby="${titleId} ${descId}" focusable="false">` +
    `<title id="${titleId}">${esc(spec.title)}</title><desc id="${descId}">${esc(spec.summary)}</desc>` +
    `<g class="ch-legend-row">${legend}</g>` +
    (labelAbove ? '' : `<line class="ch-axis" x1="${LABEL_W}" y1="${legendH - 4}" x2="${LABEL_W}" y2="${height - 2}"/>`) +
    rows + `</svg>`;
};

export const chartTable = (spec) => {
  const stacked = !!spec.stacked;
  const tot = totals(spec);
  const head = [spec.categoryHeader || 'Category', ...spec.series.map((s) => s.name), ...(stacked ? ['Total'] : [])];
  return `<table class="model-table chart-table" id="${spec.id}-table"><caption class="sr-only">${esc(spec.title)}: data</caption>` +
    `<thead><tr>${head.map((h, i) => `<th scope="col"${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>` +
    spec.categories.map((cat, i) => `<tr><th scope="row">${esc(cat)}</th>${spec.series.map((s) => `<td class="num">${num(s.values[i])}</td>`).join('')}${stacked ? `<td class="num">${num(tot[i])}</td>` : ''}</tr>`).join('') +
    `</tbody></table>`;
};

/** The figure: caption, the SVG and its table. */
export const chartFigure = (spec) =>
  `<figure class="chart" id="${spec.id}">` +
  `<figcaption class="chart-title">${esc(spec.title)}</figcaption>` +
  `<div class="chart-box">${chartSvg(spec, 'wide')}${chartSvg(spec, 'narrow')}</div>` +
  (spec.note ? `<p class="chart-note muted">${esc(spec.note)}</p>` : '') +
  `<details class="chart-data"><summary>Data table: ${esc(spec.title)}</summary><div class="table-wrap">${chartTable(spec)}</div></details>` +
  `</figure>`;
