#!/usr/bin/env node
// monthly-checks.mjs — the monthly maintenance routine, run by .github/workflows/monthly-checks.yml.
// It runs the three checks that are outside npm test because they read the network or are slow:
//   links (internal links, offline) · check-sources (provider and evidence URLs) · verify-quotes (quoted passages)
// and prints one Markdown report. With --publish it opens a GitHub issue when something failed, comments on
// the open routine issue if there is one, and closes that issue once a later run is clean.
// It only reports: it never edits data. Output is our own URLs, ids and statuses, never page text.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const TITLE_PREFIX = 'Monthly source check';
const MAX_LINES = 80;

export const CHECKS = [
  { name: 'Internal links', script: 'scripts/check-links.mjs' },
  { name: 'Source URLs (check-sources)', script: 'scripts/check-sources.mjs' },
  { name: 'Quoted passages (verify-quotes)', script: 'scripts/verify-quotes.mjs' },
];

const FENCE = '`'.repeat(3);
// eslint-disable-next-line no-control-regex
const stripAnsi = (s) => String(s).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const tail = (s, n = MAX_LINES) => {
  const lines = stripAnsi(s).trimEnd().split('\n');
  return lines.length > n ? [`… (${lines.length - n} earlier lines omitted)`, ...lines.slice(-n)].join('\n') : lines.join('\n');
};

/** Renders the issue body for a set of check results: [{ name, ok, output }]. */
export function renderReport(results, { month, runUrl } = {}) {
  const failed = results.filter((r) => !r.ok);
  const out = [
    `Automated run of the monthly maintenance checks${month ? ` for ${month}` : ''}.${runUrl ? ` [Workflow run](${runUrl}).` : ''}`,
    '',
    failed.length ? `**${failed.length} of ${results.length} checks need attention.**` : `**All ${results.length} checks passed.**`,
    '',
    '| Check | Result |',
    '|---|---|',
    ...results.map((r) => `| ${r.name} | ${r.ok ? '✅ passed' : '❌ needs attention'} |`),
  ];
  for (const r of failed) out.push('', `### ${r.name}`, '', FENCE + 'text', tail(r.output).split(FENCE).join("'''"), FENCE);
  if (failed.length) {
    out.push('', '_Provider CDNs often answer GitHub runners with 403 or a timeout, so "unreachable" from here is a lead, not a verdict: re-check from a normal connection before changing data, following docs/update-playbook.md._');
  }
  return out.join('\n');
}

const gh = (args, input) => {
  const r = spawnSync('gh', args, { encoding: 'utf8', input });
  if (r.status !== 0) throw new Error(`gh ${args.slice(0, 2).join(' ')} failed: ${(r.stderr || '').trim()}`);
  return r.stdout.trim();
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = CHECKS.map(({ name, script }) => {
    const r = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, VERIFY_RUNNER: 'github-actions' } });
    return { name, ok: r.status === 0, output: `${r.stdout || ''}${r.stderr || ''}` };
  });
  const month = new Date().toISOString().slice(0, 7);
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  const runUrl = GITHUB_RUN_ID ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : '';
  const body = renderReport(results, { month, runUrl });
  console.log(body);
  if (process.argv.includes('--publish')) {
    const open = JSON.parse(gh(['issue', 'list', '--state', 'open', '--search', `in:title "${TITLE_PREFIX}"`, '--json', 'number,title']))
      .filter((i) => i.title.startsWith(TITLE_PREFIX));
    const failed = results.some((r) => !r.ok);
    if (open.length) {
      gh(['issue', 'comment', String(open[0].number), '--body-file', '-'], body);
      if (!failed) gh(['issue', 'close', String(open[0].number), '--reason', 'completed']);
    } else if (failed) {
      gh(['issue', 'create', '--title', `${TITLE_PREFIX}: ${month}`, '--label', 'chore', '--body-file', '-'], body);
    }
  }
}
