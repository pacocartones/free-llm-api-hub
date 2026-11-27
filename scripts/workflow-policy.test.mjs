// Repository-wide rules for every GitHub Actions workflow. The per-workflow tests (regenerate, indexnow, mirrors…) check
// their own file; this one makes the shared rules hold for every file in .github/workflows, including the next one added,
// so a new workflow cannot quietly drop a rule the others follow:
//   1. every action is pinned by a full commit SHA, with the version as a comment (the repository also enforces SHA pinning
//      in its settings; this fails in the pull request instead of at run time, with the file and line);
//   2. every workflow sets `permissions:` at the top, so no job inherits the default token scope;
//   3. every actions/checkout step sets `persist-credentials: false`, so no later step finds a token in .git/config;
//   4. a `pull_request_target` workflow, or a `workflow_run` workflow whose upstream can run on a pull request (both run
//      with the base repository's token on behalf of a pull request), grants nothing at the top, checks nothing out and
//      runs no npm or repository script. A `workflow_run` is exempt only when it is limited to `branches: [main]` and
//      every upstream it names is a workflow of this repository with no pull-request trigger (pages.yml after
//      "Regenerate derived files");
//   5. text an outsider controls (pull request or issue title and body, comment body, branch name) never appears inside a
//      `run:` script, where `${{ }}` is pasted into the shell before it runs; pass it through `env:` instead.
// Plain line parsing, no YAML dependency: the workflows here are written in one consistent block style.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, '.github/workflows');
const WORKFLOWS = readdirSync(DIR).filter((n) => /\.ya?ml$/.test(n)).sort()
  .map((name) => ({ name, lines: readFileSync(join(DIR, name), 'utf8').replace(/\r\n/g, '\n').split('\n') }));

const indent = (line) => line.match(/^ */)[0].length;
const code = (line) => line.replace(/\s+#.*$/, '');

/** Every step as { start, lines }: from its `- ` line to the next line at the same or a lower indentation. */
function steps(lines) {
  const out = [];
  lines.forEach((line, i) => {
    const m = line.match(/^( *)- (?:uses|name|run|id|if|env|with|shell|working-directory|timeout-minutes|continue-on-error):/);
    if (!m) return;
    const base = m[1].length;
    let end = i + 1;
    while (end < lines.length && (lines[end].trim() === '' || indent(lines[end]) > base)) end++;
    out.push({ start: i, lines: lines.slice(i, end) });
  });
  return out;
}

/** The line numbers (0-based) that belong to a `run:` script, the `run:` line included. */
function runLines(lines) {
  const inRun = new Set();
  lines.forEach((line, i) => {
    const m = line.match(/^( *)(?:- )?run:(.*)$/);
    if (!m) return;
    inRun.add(i);
    if (!/^\s*[|>][-+]?\s*(#.*)?$/.test(m[2])) return; // a one-line script
    const base = indent(line) + (line.trimStart().startsWith('- ') ? 2 : 0);
    for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || indent(lines[j]) > base); j++) inRun.add(j);
  });
  return inRun;
}

/** The trigger names under the top-level `on:` key. */
function triggers(lines) {
  const at = lines.findIndex((l) => /^on:/.test(l));
  if (at < 0) return [];
  const inline = lines[at].match(/^on:\s*\[?([^\]#]+)\]?/);
  if (inline && inline[1].trim()) return inline[1].split(',').map((s) => s.trim());
  const names = [];
  for (let i = at + 1; i < lines.length && (lines[i].trim() === '' || lines[i].startsWith(' ') || lines[i].startsWith('#')); i++) {
    const m = lines[i].match(/^ {2}([a-z_]+):/);
    if (m) names.push(m[1]);
  }
  return names;
}

test('the policy reads every workflow file', () => {
  assert.ok(WORKFLOWS.length >= 10, `found ${WORKFLOWS.length} workflows`);
  for (const { name, lines } of WORKFLOWS) assert.ok(triggers(lines).length > 0, `${name}: no trigger found under on:`);
});

test('every action is pinned by a full commit SHA with its version as a comment', () => {
  const bad = [];
  for (const { name, lines } of WORKFLOWS) {
    lines.forEach((line, i) => {
      const m = line.match(/^\s*(?:- )?uses:\s*(\S+)(.*)$/);
      if (!m || m[1].startsWith('./') || m[1].startsWith('docker://')) return;
      if (!/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(m[1]) || !/#\s*v?\d/.test(m[2])) bad.push(`${name}:${i + 1} ${line.trim()}`);
    });
  }
  assert.deepEqual(bad, [], 'pin each action as owner/repo@<40-char SHA> # vX.Y.Z');
});

test('every workflow sets top-level permissions', () => {
  const missing = WORKFLOWS.filter(({ lines }) => !lines.some((l) => /^permissions:/.test(l))).map((w) => w.name);
  assert.deepEqual(missing, [], 'add `permissions: {}` (or the narrowest scope) at the top of each workflow');
});

test('every checkout sets persist-credentials: false', () => {
  const bad = [];
  for (const { name, lines } of WORKFLOWS) {
    for (const step of steps(lines)) {
      if (!step.lines.some((l) => /uses:\s*actions\/checkout@/.test(l))) continue;
      if (!step.lines.some((l) => /^\s*persist-credentials:\s*false\b/.test(code(l)))) bad.push(`${name}:${step.start + 1}`);
    }
  }
  assert.deepEqual(bad, [], 'set `with: persist-credentials: false` on actions/checkout');
});

/** The lines of one trigger block under `on:` (its key line excluded). */
function triggerBlock(lines, name) {
  const at = lines.findIndex((l) => l === `  ${name}:` || l.startsWith(`  ${name}: `) || l.startsWith(`  ${name}:#`));
  if (at < 0) return [];
  let end = at + 1;
  while (end < lines.length && (lines[end].trim() === '' || indent(lines[end]) > 2)) end++;
  return lines.slice(at + 1, end);
}

const PR_TRIGGERS = new Set(['pull_request', 'pull_request_target']);
const workflowName = (lines) => lines.find((l) => /^name:/.test(l))?.replace(/^name:\s*/, '').replace(/^['"]|['"]$/g, '').trim();

/** Whether a workflow_run trigger can act on behalf of a pull request: true unless it is limited to main and every
 * upstream it names is a workflow here with no pull-request trigger. */
function workflowRunPrivileged(lines) {
  const block = triggerBlock(lines, 'workflow_run').map(code).join('\n');
  const upstream = block.match(/workflows:\s*\[([^\]]*)\]/)?.[1]?.split(',').map((w) => w.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) ?? [];
  if (!upstream.length || !/branches:\s*\[\s*main\s*\]/.test(block)) return true;
  return upstream.some((n) => {
    const wf = WORKFLOWS.find((w) => workflowName(w.lines) === n);
    return !wf || triggers(wf.lines).some((t) => PR_TRIGGERS.has(t));
  });
}

test('privileged pull-request triggers grant nothing at the top and run no pull request code', () => {
  const privileged = WORKFLOWS.filter(({ lines }) => triggers(lines).some((t) => t === 'pull_request_target' || (t === 'workflow_run' && workflowRunPrivileged(lines))));
  for (const { name, lines } of privileged) {
    assert.ok(lines.some((l) => /^permissions:\s*\{\}\s*(#.*)?$/.test(l)), `${name}: top-level permissions must be {}`);
    const text = lines.map(code).join('\n');
    assert.doesNotMatch(text, /uses:\s*actions\/checkout@/, `${name}: no checkout under a privileged trigger`);
    assert.doesNotMatch(text, /\bnpm (?:ci|install|run|test)\b|\bnode scripts\//, `${name}: no npm or repository script under a privileged trigger`);
  }
});

const UNTRUSTED = /\$\{\{[^}]*\b(?:github\.event\.(?:pull_request|issue|discussion)\.(?:title|body)|github\.event\.(?:comment|review|review_comment)\.body|github\.event\.pull_request\.head\.(?:ref|label)|github\.head_ref|github\.event\.head_commit\.message|github\.event\.commits)/;

test('text an outsider controls is never pasted into a run script', () => {
  const bad = [];
  for (const { name, lines } of WORKFLOWS) {
    const inRun = runLines(lines);
    lines.forEach((line, i) => { if (inRun.has(i) && UNTRUSTED.test(line)) bad.push(`${name}:${i + 1} ${line.trim()}`); });
  }
  assert.deepEqual(bad, [], 'pass the value through `env:` and read it as "$VAR" in the script');
});

// The parsers above are what the rules stand on; check them on small inputs so a parsing slip cannot pass every rule silently.
test('the line parsers find triggers, run scripts and checkout steps', () => {
  const sample = [
    'on:', '  pull_request_target:', '    types: [opened]', '  push:', 'permissions: {}', 'jobs:', '  a:', '    steps:',
    '      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567 # v1', '        with:', '          fetch-depth: 0',
    '      - name: Echo', '        env:', '          T: ${{ github.event.pull_request.title }}', '        run: |',
    '          echo "$T"', '          echo ${{ github.head_ref }}', '      - run: echo ok',
  ];
  assert.deepEqual(triggers(sample), ['pull_request_target', 'push']);
  assert.deepEqual(triggers(['on: [push, pull_request]']), ['push', 'pull_request']);
  const inRun = runLines(sample);
  assert.deepEqual([...inRun].sort((a, b) => a - b), [14, 15, 16, 17]);
  assert.ok(UNTRUSTED.test(sample[16]) && UNTRUSTED.test(sample[13]), 'both spellings are recognised; only the run line is reported');
  const checkout = steps(sample).find((s) => s.lines[0].includes('actions/checkout'));
  assert.equal(checkout.lines.length, 3, 'a step ends at the next step');
  assert.ok(!checkout.lines.some((l) => /persist-credentials:\s*false/.test(l)));
});

test('a failing Verify run on main opens or updates one issue, and a clean run closes it', () => {
  const verify = readFileSync(join(DIR, 'verify.yml'), 'utf8');
  const job = verify.split(/\n {2}report:\n/)[1];
  assert.ok(job, 'verify.yml has a report job');
  assert.match(job, /needs: \[validate, windows-tests\]/);
  assert.match(job, /github\.repository == 'pacocartones\/free-llm-api-hub' && github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request'/);
  assert.match(job, /permissions:\n\s+issues: write\n/, 'only this job may write, and only issues');
  assert.doesNotMatch(job, /actions\/checkout|npm |node scripts\//, 'the report job runs no repository code');
  assert.match(job, /title='Verify failed on main'/);
  assert.match(job, /gh issue close "\$number" --reason completed/);
  const top = verify.split(/\njobs:\n/)[0];
  assert.match(top, /\npermissions:\n {2}contents: read\n/, 'the rest of the workflow stays read-only');
});

test('a workflow_run is exempt only when its upstream never runs on a pull request and it is limited to main', () => {
  const sample = (on) => ['name: X', 'on:', ...on, 'permissions:', '  contents: read'];
  assert.equal(workflowRunPrivileged(sample(['  workflow_run:', "    workflows: ['Regenerate derived files']", '    types: [completed]', '    branches: [main]'])), false);
  assert.equal(workflowRunPrivileged(sample(['  workflow_run:', "    workflows: ['Regenerate derived files']", '    types: [completed]'])), true, 'no branch filter');
  assert.equal(workflowRunPrivileged(sample(['  workflow_run:', "    workflows: ['Verify']", '    branches: [main]'])), true, 'Verify runs on pull requests');
  assert.equal(workflowRunPrivileged(sample(['  workflow_run:', "    workflows: ['No such workflow']", '    branches: [main]'])), true, 'an unknown upstream');
  // Every workflow_run in the repository today: pages.yml after the regeneration bot, and web-deploy-trigger.yml after
  // "Deploy site" (it checks out nothing and only calls the Worker's deploy hook).
  const exempt = WORKFLOWS.filter(({ lines }) => triggers(lines).includes('workflow_run') && !workflowRunPrivileged(lines)).map((w) => w.name);
  assert.deepEqual(exempt.sort(), ['pages.yml', 'web-deploy-trigger.yml']);
});
