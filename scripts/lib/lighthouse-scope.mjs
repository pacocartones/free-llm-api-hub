// Whether a change can move a Lighthouse score (.github/workflows/lighthouse.yml, scripts/lighthouse-scope.mjs).
//
// Lighthouse measures the built site, so it only needs to run when something the build reads, the site itself or
// the gate's own tooling changed. The list below is the other way round on purpose: it names what is known NOT to
// reach the site, and every other path counts as relevant. A new input of the build is then measured by default,
// and a mistake here costs one unnecessary run, never a missed regression.
//
// Not measured:
//   - docs/**, except docs/methodology.md (rendered at /methodology/)
//   - .github/**, except the Lighthouse workflow itself
//   - Markdown files at the repository root, except README.md (the build checks its figures) and CONTRIBUTING.md
//     (rendered at /contributing/)
//   - packages/** (the MCP package, tested by mcp-ci.yml)
//   - the test files, scripts/<name>.test.mjs: the build imports no test (the pipeline's modules live beside them, and
//     those stay measured)

const MEASURED_EXCEPTIONS = new Set([
  'docs/methodology.md',
  '.github/workflows/lighthouse.yml',
  'README.md',
  'CONTRIBUTING.md',
]);

/** True when a change to this repository-relative path cannot change what Lighthouse measures. */
export function outsideSite(path) {
  const p = String(path).replace(/\\/g, '/').replace(/^\.\//, '');
  if (!p || MEASURED_EXCEPTIONS.has(p)) return false;
  if (p.startsWith('docs/') || p.startsWith('.github/') || p.startsWith('packages/')) return true;
  if (/^scripts\/[^/]+\.test\.mjs$/.test(p)) return true;
  return !p.includes('/') && p.toLowerCase().endsWith('.md');
}

/**
 * The decision for a list of changed paths. An empty list (or no list: the range could not be computed) runs
 * Lighthouse, so the gate only ever skips when it can name every changed file and none of them reaches the site.
 */
export function lighthouseScope(paths) {
  const list = (paths ?? []).filter(Boolean);
  if (!list.length) return { run: true, reason: 'the changed files are not known, so the site is measured' };
  const relevant = list.filter((p) => !outsideSite(p));
  if (relevant.length) {
    const more = relevant.length > 1 ? ` and ${relevant.length - 1} more` : '';
    return { run: true, reason: `${relevant[0]}${more} can change the built site` };
  }
  return { run: false, reason: `none of the ${list.length} changed file(s) reaches the built site` };
}
