// changelog-fragments.mjs — changelog entries as one file per pull request, collected into CHANGELOG.md at release.
//
// Every pull request used to add its line under `## [Unreleased]` in CHANGELOG.md, at the same spot, so any two open
// pull requests conflicted there. Now a pull request adds `changes/unreleased/<slug>.md` (a file nobody else
// touches) and the release (`npm run release:prepare`) moves every fragment into CHANGELOG.md. The format of a
// fragment is the format of the changelog itself, so collecting is a plain move:
//
//   ### Changed and fixed
//
//   - Modal re-verified: the Starter plan's monthly credit is still not settled for commercial use (#688).
//     Thanks @user.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const FRAGMENT_DIR = 'changes/unreleased';
/** The sections a fragment may use, in the order a release lists them (RELEASING.md, "What a release looks like"). */
export const SECTIONS = ['Breaking changes and upgrade', 'Added', 'Changed and fixed', 'Removed', 'Security'];
export const FRAGMENT_NAME_RE = /^[a-z0-9][a-z0-9-]{0,79}\.md$/;
// Files in the directory that are not fragments.
const NOT_FRAGMENT = new Set(['.gitkeep', 'README.md']);

const normalise = (text) => String(text).replace(/\r\n?/g, '\n');

/** Split Markdown into a preamble and its `### ` sections, in order. */
function splitSections(text) {
  const out = { preamble: [], sections: [] };
  let current = null;
  for (const line of normalise(text).split('\n')) {
    const h = /^### (.+?)\s*$/.exec(line);
    if (h) { current = { heading: h[1], body: [] }; out.sections.push(current); continue; }
    (current ? current.body : out.preamble).push(line);
  }
  const trim = (lines) => { const s = lines.join('\n').trim(); return s ? s : ''; };
  return { preamble: trim(out.preamble), sections: out.sections.map((s) => ({ heading: s.heading, body: trim(s.body) })) };
}

/** Errors of one fragment (name and text); an empty list when it can be collected. */
export function fragmentErrors(name, text) {
  const errors = [];
  const where = `${FRAGMENT_DIR}/${name}`;
  if (!FRAGMENT_NAME_RE.test(name)) errors.push(`${where}: name it with lowercase letters, digits and hyphens, ending in .md (for example modal-commercial-terms.md)`);
  const { preamble, sections } = splitSections(text);
  if (preamble) errors.push(`${where}: start with a section heading (### ${SECTIONS.join(', ### ')})`);
  if (!sections.length) errors.push(`${where}: has no section`);
  const seen = new Set();
  for (const s of sections) {
    if (!SECTIONS.includes(s.heading)) errors.push(`${where}: unknown section "### ${s.heading}"; use one of: ${SECTIONS.join(', ')}`);
    if (seen.has(s.heading)) errors.push(`${where}: section "### ${s.heading}" appears twice`);
    seen.add(s.heading);
    if (!/^- \S/m.test(s.body)) errors.push(`${where}: section "### ${s.heading}" needs at least one entry starting with "- "`);
    if (/^#{1,2} /m.test(s.body)) errors.push(`${where}: only "### " headings are allowed inside a fragment`);
  }
  return errors;
}

/** The fragments on disk, sorted by name: [{ name, text }]. */
export function readFragments(root) {
  const dir = join(root, FRAGMENT_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => !NOT_FRAGMENT.has(n)).sort()
    .map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }));
}

/**
 * CHANGELOG.md with the fragments moved under `## [Unreleased]`, or, with `release`, under a new
 * `## [version] — date` heading that takes everything `## [Unreleased]` held (which is left empty).
 * Entries keep their order: what was already in the changelog first, then the fragments by file name.
 */
export function collectFragments(changelog, fragments, release = null) {
  const bad = fragments.flatMap((f) => fragmentErrors(f.name, f.text));
  if (bad.length) throw new Error(bad.join('\n'));
  const text = normalise(changelog);
  const start = text.indexOf('\n## [Unreleased]');
  if (start < 0) throw new Error('CHANGELOG.md has no "## [Unreleased]" heading');
  const bodyStart = text.indexOf('\n', start + 1) + 1;
  const next = text.indexOf('\n## [', bodyStart - 1);
  const end = next < 0 ? text.length : next + 1;
  const current = splitSections(text.slice(bodyStart, end));

  const bodies = new Map(current.sections.map((s) => [s.heading, [s.body].filter(Boolean)]));
  for (const f of [...fragments].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    for (const s of splitSections(f.text).sections) {
      if (!bodies.has(s.heading)) bodies.set(s.heading, []);
      bodies.get(s.heading).push(s.body);
    }
  }
  // Known sections in release order, then any other heading the changelog already had, in its own order.
  const order = [...SECTIONS.filter((h) => bodies.has(h)), ...[...bodies.keys()].filter((h) => !SECTIONS.includes(h))];
  const parts = [];
  if (current.preamble) parts.push(current.preamble);
  for (const h of order) if (bodies.get(h).length) parts.push(`### ${h}\n\n${bodies.get(h).join('\n')}`);
  const content = parts.join('\n\n');

  let section;
  if (release) {
    if (!/^\d+\.\d+\.\d+$/.test(release.version || '') || !/^\d{4}-\d{2}-\d{2}$/.test(release.date || '')) throw new Error('release needs version X.Y.Z and date YYYY-MM-DD');
    if (text.includes(`\n## [${release.version}]`)) throw new Error(`CHANGELOG.md already has a section for ${release.version}`);
    section = `## [Unreleased]\n\n## [${release.version}] — ${release.date}\n\n${content ? content + '\n\n' : ''}`;
  } else {
    section = `## [Unreleased]\n\n${content ? content + '\n\n' : ''}`;
  }
  return text.slice(0, start + 1) + section + text.slice(end);
}
