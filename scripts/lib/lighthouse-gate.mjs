// lighthouse-gate.mjs — the pass/fail rule for the Lighthouse + accessibility CI gate.
//
// Pure on purpose: it takes parsed Lighthouse reports and a thresholds object and
// returns the failures, so the rule is unit-tested without a browser.
// A category that is missing or has a null score (Lighthouse could not compute it)
// is a failure, never a pass: "no score" must not read as "fine".

export const THRESHOLDS = Object.freeze({ accessibility: 0.95, performance: 0.8 });

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
