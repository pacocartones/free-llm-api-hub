// lighthouse-gate.mjs — the pass/fail rule for the Lighthouse + accessibility CI gate.
//
// Pure on purpose: it takes parsed Lighthouse reports and a thresholds object and
// returns the failures, so the rule is unit-tested without a browser.
// A category that is missing or has a null score (Lighthouse could not compute it)
// is a failure, never a pass: "no score" must not read as "fine".

export const THRESHOLDS = Object.freeze({ accessibility: 0.95, performance: 0.8 });

// The gate runs in two shapes. Accessibility and SEO do not depend on the runner's speed,
// so one run per page is a stable verdict and pull requests get it in a few minutes.
// Performance moves between runs on a shared runner, so it keeps the median of three
// and runs after a merge to main and nightly, where a slow sample costs no contributor a wait.
// `full` is the old single pass (all three categories, median of three), for local runs.
export const MODES = Object.freeze({
  'accessibility-seo': Object.freeze({
    categories: Object.freeze(['accessibility', 'seo']),
    runs: 1,
    thresholds: Object.freeze({ accessibility: THRESHOLDS.accessibility, seo: 1 }),
  }),
  performance: Object.freeze({
    categories: Object.freeze(['performance']),
    runs: 3,
    thresholds: Object.freeze({ performance: THRESHOLDS.performance }),
  }),
  full: Object.freeze({
    categories: Object.freeze(['accessibility', 'performance', 'seo']),
    runs: 3,
    thresholds: Object.freeze({ ...THRESHOLDS, seo: 1 }),
  }),
});

/** Reads `--mode=<name>` from the command line; no flag means `full`. An unknown name throws. */
export function parseMode(argv = []) {
  const flag = argv.find((a) => a.startsWith('--mode='));
  const name = flag ? flag.slice('--mode='.length) : 'full';
  if (!Object.hasOwn(MODES, name)) throw new Error(`unknown --mode=${name}; use one of: ${Object.keys(MODES).join(', ')}`);
  return { name, ...MODES[name] };
}

const EXEMPT_NULL_MODES = new Set(['informative', 'manual', 'notApplicable']);

function auditNodes(audit) {
  return (audit?.details?.items ?? [])
    .slice(0, 3)
    .map((item) => String(item?.node?.snippet ?? item?.node?.selector ?? '').replace(/\s+/g, ' ').trim().slice(0, 160))
    .filter(Boolean);
}

export function evaluate(url, report, thresholds = THRESHOLDS, baseline = {}) {
  const failures = [];
  const categories = (report && report.categories) || {};
  for (const [name, minimum] of Object.entries(thresholds)) {
    const score = categories[name] ? categories[name].score : undefined;
    if (typeof score !== 'number') {
      failures.push(`${url}: ${name} has no score`);
    } else if (score < minimum) {
      failures.push(`${url}: ${name} ${score.toFixed(2)} is below ${minimum.toFixed(2)}`);
    }
  }

  const allowed = new Set(baseline[url] ?? []);
  const auditFailures = new Map();
  const runs = report?.auditRuns ?? (report ? [report] : []);
  for (const run of runs) {
    for (const ref of run?.categories?.accessibility?.auditRefs ?? []) {
      if (ref.weight === 0) continue;
      const audit = run?.audits?.[ref.id];
      if (!audit || (typeof audit.score !== 'number' && !EXEMPT_NULL_MODES.has(audit.scoreDisplayMode))) {
        auditFailures.set(ref.id, `${url}: accessibility audit ${ref.id} returned no score`);
        continue;
      }
      if (allowed.has(ref.id)) continue;
      if (typeof audit.score === 'number' && audit.score < 1) {
        const nodes = auditNodes(audit);
        auditFailures.set(ref.id, `${url}: new accessibility audit ${ref.id} failed${nodes.length ? ` — ${nodes.join(' | ')}` : ''}`);
      }
    }
  }
  failures.push(...auditFailures.values());
  return failures;
}

// Lighthouse performance moves between runs on a shared runner (the home page scored
// 0.78 and then 0.91 in two CI runs of the same commit), so the gate judges the median
// of several runs. The result has the shape evaluate() reads.
export function medianReport(reports) {
  const names = new Set(reports.flatMap((r) => Object.keys((r && r.categories) || {})));
  const categories = {};
  for (const name of names) {
    const scores = reports.map((r) => r && r.categories && r.categories[name] && r.categories[name].score);
    // One run without a score makes the median unreliable: keep it as "no score".
    if (scores.some((x) => typeof x !== 'number')) { categories[name] = { score: null }; continue; }
    const sorted = [...scores].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    categories[name] = { score: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2 };
  }
  // Retain the raw reports so audit-level failures from any run cannot be hidden
  // by a healthy median category score.
  return { categories, auditRuns: reports };
}

// The production edge (Cloudflare) sends HTML, CSS, JS, JSON, SVG and XML compressed; the gate's local server used to send
// them raw, so the home page's 270 KB of HTML took seconds to arrive under Lighthouse's simulated mobile network and the
// score measured the test server, not the site (0.93 locally against 0.99 on the live page). The server compresses the same
// types the edge does, with the encoding the browser asks for: brotli first, then gzip, else the raw bytes. Fonts and PNG are
// already compressed and stay as they are.
const COMPRESSIBLE = /^(text\/|application\/(json|xml|javascript)|image\/svg\+xml)/;
export function negotiateEncoding(contentType, acceptEncoding = '') {
  if (!COMPRESSIBLE.test(String(contentType || ''))) return null;
  const offered = String(acceptEncoding || '').toLowerCase().split(',').map((s) => s.trim().split(';')[0]);
  if (offered.includes('br')) return 'br';
  if (offered.includes('gzip')) return 'gzip';
  return null;
}
