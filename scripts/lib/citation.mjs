// citation.mjs — BibTeX and APA citations of the dataset, generated from CITATION.cff at build time.
//
// CITATION.cff is the one place that says how the dataset is cited (GitHub's "Cite this repository" reads it too), and
// the build already keeps its version and date-released pinned to the dataset. The /embed/ page shows these two
// strings, so they move with the file and are never typed twice. Reuses the small reader of lib/dataset-jsonld.mjs.

import { timeHtml } from './dates.mjs';
import { parseCitation } from './dataset-jsonld.mjs';
import { escapeHtml, escapeText } from './html.mjs';

/** The fields a citation needs: title, url, version, year and date released, authors, repository, licence. */
export function citationRecord(cffText) {
  const c = parseCitation(cffText);
  const date = (String(cffText).match(/^date-released:\s*["']?(\d{4}-\d{2}-\d{2})["']?\s*$/m) || [])[1] || null;
  const a = c.author || {};
  const author = a.name || [a['given-names'], a['family-names']].filter(Boolean).join(' ') || a.alias || '';
  return {
    title: c.title || '',
    url: c.url || c['repository-code'] || '',
    repository: c['repository-code'] || '',
    version: c.version || '',
    license: c.license || '',
    date,
    year: date ? date.slice(0, 4) : '',
    author,
  };
}

// BibTeX special characters in a field value: braces stay balanced, and the TeX specials are escaped.
// One pass: backslashes and braces are dropped, every other special gets a leading backslash.
const bib = (s) => String(s).replace(/[\\{}&%$#_]/g, (ch) => ('\\{}'.includes(ch) ? '' : `\\${ch}`));

export function bibtex(r) {
  const key = `freellmapihub${r.year || ''}`;
  const lines = [
    ['author', bib(r.author)],
    ['title', `{${bib(r.title)}}`],
    ['year', r.year],
    ['version', bib(r.version)],
    ['url', r.url],
    ['note', `Dataset${r.repository ? `, ${r.repository}` : ''}${r.license ? `. ${bib(r.license)} license` : ''}`],
  ].filter(([, v]) => v);
  return `@misc{${key},\n${lines.map(([k, v]) => `  ${k.padEnd(7)} = {${v}}`).join(',\n')}\n}`;
}

// APA 7, data set: Author. (Year). Title (Version x) [Data set]. URL
export function apa(r) {
  const who = r.author ? `${r.author}.` : '';
  return `${who} (${r.year || 'n.d.'}). ${r.title}${r.version ? ` (Version ${r.version})` : ''} [Data set]. ${r.url}`.trim();
}

/** Shared "Cite this dataset" section rendered from a `citationRecord()` object. */
export function citeBlockHtml(r, { heading = 'Cite this dataset' } = {}) {
  const pre = (text, id) => `<pre data-snippet="citation"><code id="${id}">${escapeText(text)}</code></pre>`;
  return (
    `<h2 id="cite">${escapeHtml(heading)}</h2>` +
    `<p>From the repository’s <a href="${escapeHtml(r.repository)}/blob/main/CITATION.cff" target="_blank" rel="noopener">CITATION.cff</a>, version ${escapeHtml(r.version)} of ${timeHtml(r.date || '', escapeHtml)}. GitHub’s “Cite this repository” reads the same file.</p>` +
    `<h3>BibTeX</h3>` + pre(bibtex(r), 'cite-bibtex') +
    `<h3>APA</h3>` + pre(apa(r), 'cite-apa') +
    `<p class="muted">The data is ${escapeHtml(r.license)} licensed. Terms change without notice: say which version or date you used, and link back so readers can check the current entry.</p>`
  );
}
