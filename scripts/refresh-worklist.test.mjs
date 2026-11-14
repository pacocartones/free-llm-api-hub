import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { stalenessWorklist } from './staleness.mjs';
import { worklistIssueBody, updateWorklistIssue } from './refresh-worklist.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'scripts/refresh-worklist.mjs');
const SHA = '0123456789abcdef0123456789abcdef01234567';
const NOW = new Date('2026-11-14T12:00:00Z');
const ENDPOINT = 'repos/pacocartones/free-llm-api-hub/issues/4';
const issue = (body, fields = {}) => JSON.stringify({ number: 4, state: 'open', body, ...fields });
const fixture = [
  ...[60, 61, 90, 91].map((age) => ({
    slug: `age-${age}`, name: `Age ${age}`, verified: true,
    last_verified: new Date(+NOW - age * 86400000).toISOString().slice(0, 10),
  })),
  { slug: 'unknown', name: 'Unknown', verified: false, notes: 'Needs human review.', docs_url: 'https://example.invalid/$(do-not-run)' },
];

test('dated body reuses the renderer without changing providers', () => {
  const before = JSON.stringify(fixture);
  const body = worklistIssueBody(fixture, NOW, SHA);
  assert.ok(body.includes(stalenessWorklist(fixture, NOW)));
  assert.match(body, /2026-11-14 UTC/);
  assert.ok(body.includes(`https://github.com/pacocartones/free-llm-api-hub/blob/${SHA}/data/providers.json`));
  assert.ok(body.includes('Worklist refresh only; provider claims were not re-verified.'));
  assert.match(body, /entire issue body.*replaced on.*refresh/i);
  assert.match(body, /discussion.*comments/i);
  assert.match(body, /checked boxes.*not evidence/i);
  assert.match(body, /🔴 1 overdue · 🟡 2 due soon · ⚠️ 1 never verified · ✅ 1 fresh/);
  assert.ok(body.endsWith('\n') && !body.endsWith('\n\n'));
  assert.equal(JSON.stringify(fixture), before);
});

test('empty and equal-date fixtures preserve renderer output', () => {
  for (const providers of [[], ['z', 'a', 'm'].map((slug) => ({ slug, name: slug, verified: true, last_verified: '2026-08-15' }))]) {
    const before = JSON.stringify(providers);
    const body = worklistIssueBody(providers, NOW, SHA);
    assert.ok(body.endsWith(`${stalenessWorklist(providers, NOW)}\n`));
    assert.equal(JSON.stringify(providers), before);
    if (!providers.length) assert.match(body, /🔴 0 overdue · 🟡 0 due soon · ⚠️ 0 never verified · ✅ 0 fresh/);
  }
});

test('UTC header and report share one clock', () => {
  const providers = [{ slug: 'boundary', name: 'Boundary', verified: true, last_verified: '2026-09-14' }];
  for (const [clock, date, due] of [
    ['2026-11-13T23:59:59.999Z', '2026-11-13', 0],
    ['2026-11-14T00:00:00.000Z', '2026-11-14', 1],
  ]) {
    const now = new Date(clock);
    const body = worklistIssueBody(providers, now, SHA);
    assert.ok(body.includes(`${date} UTC`));
    assert.ok(body.includes(stalenessWorklist(providers, now)));
    assert.ok(body.includes(`🟡 ${due} due soon`));
  }
});

test('invalid source SHA and invalid clock are rejected', () => {
  for (const sha of ['', SHA.toUpperCase(), SHA.slice(1), `${SHA}0`, null, `${SHA}\n`]) {
    assert.throws(() => worklistIssueBody([], NOW, sha), /SHA/);
  }
  for (const clock of [new Date(NaN), null, '2026-11-14', 0]) {
    assert.throws(() => worklistIssueBody([], clock, SHA), /clock/);
  }
});

test('identical issue skips PATCH', () => {
  const calls = [];
  assert.equal(updateWorklistIssue('same\n', (args, input) => {
    calls.push({ args, input });
    return issue('same\n');
  }), false);
  assert.deepEqual(calls, [{ args: ['api', ENDPOINT], input: undefined }]);
});

test('changed issue patches body only through stdin', () => {
  const body = 'Quotes " \' ` $(never-run)\n${untrusted}\nhttps://example.invalid';
  const calls = [];
  assert.equal(updateWorklistIssue(body, (args, input) => {
    calls.push({ args, input });
    return calls.length === 1 ? issue('old') : issue(body);
  }), true);
  assert.deepEqual(calls[0], { args: ['api', ENDPOINT], input: undefined });
  assert.deepEqual(calls[1].args, ['api', '--method', 'PATCH', ENDPOINT, '--input', '-']);
  assert.deepEqual(JSON.parse(calls[1].input), { body });
  assert.ok(calls.every(({ args }) => !args.includes(body)));
});

test('closed missing malformed and PR targets fail closed', () => {
  for (const reply of [
    issue('old', { state: 'closed' }), issue('old', { number: 5 }),
    issue(null), issue('old', { pull_request: {} }), issue('old', { pull_request: null }),
    '{}', 'null', '[]', '', 'not JSON',
  ]) {
    let calls = 0;
    assert.throws(() => updateWorklistIssue('new', () => { calls++; return reply; }));
    assert.equal(calls, 1);
  }
});

test('GET and PATCH failures propagate', () => {
  for (const failAt of [1, 2]) {
    let calls = 0;
    const failure = new Error(`denied at ${failAt}`);
    assert.throws(() => updateWorklistIssue('new', () => {
      if (++calls === failAt) throw failure;
      return issue('old');
    }), (error) => error === failure);
    assert.equal(calls, failAt);
  }
});

test('mismatched PATCH response is not success', () => {
  for (const reply of [issue('wrong'), issue('new', { number: 5 }), '{}', 'null', 'invalid JSON']) {
    let calls = 0;
    assert.throws(() => updateWorklistIssue('new', () => ++calls === 1 ? issue('old') : reply));
    assert.equal(calls, 2);
  }
});

test('preview CLI needs no gh and changes no dataset', () => {
  const before = readFileSync(join(ROOT, 'data/providers.json'));
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    import { pathToFileURL } from 'node:url';
    const original = childProcess.execFileSync;
    childProcess.execFileSync = (command, args, options) => {
      if (command !== 'git') throw new Error('gh unavailable; no external commands allowed');
      return original(command, args, options);
    };
    syncBuiltinESMExports();
    process.argv = [process.execPath, ${JSON.stringify(CLI)}];
    await import(pathToFileURL(process.argv[1]));
  `], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  assert.match(output, /Worklist refresh only; provider claims were not re-verified\./);
  assert.match(output, /\*\*Summary:\*\*/);
  assert.deepEqual(readFileSync(join(ROOT, 'data/providers.json')), before);
});

test('import has no CLI side effects and unknown CLI arguments fail', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(new URL('./refresh-worklist.mjs', import.meta.url).href)});`], { encoding: 'utf8' });
  assert.equal(output, '');
  const result = (() => {
    try { execFileSync(process.execPath, [CLI, '--unknown'], { encoding: 'utf8', stdio: 'pipe' }); }
    catch (error) { return error; }
    assert.fail('unknown argument should fail');
  })();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown argument/);
});

test('weekly workflow publishes only trusted main with narrowly scoped permissions', () => {
  const workflow = readFileSync(join(ROOT, '.github/workflows/weekly-worklist.yml'), 'utf8');
  assert.match(workflow, /\n  schedule:\s*\n    - cron: ['"]17 9 \* \* 1['"]/);
  assert.match(workflow, /\n  workflow_dispatch: \{\}/);
  assert.match(workflow, /\npermissions: \{\}/);
  assert.match(workflow, /\nconcurrency:\s*\n  group: weekly-worklist\s*\n  cancel-in-progress: false/);
  assert.match(workflow, /if: \$\{\{ github\.repository == 'pacocartones\/free-llm-api-hub' && github\.ref == 'refs\/heads\/main' \}\}/);
  assert.match(workflow, /timeout-minutes: 5/);
  assert.match(workflow, /\n    permissions:\s*\n      contents: read\s*\n      issues: write/);
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(workflow, /with:\s*\n          ref: main\s*\n          persist-credentials: false/);
  assert.match(workflow, /actions\/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1/);
  assert.match(workflow, /node-version-file: \.nvmrc/);
  const focused = 'run: node --test scripts/refresh-worklist.test.mjs scripts/staleness.test.mjs';
  const publish = 'run: node scripts/refresh-worklist.mjs --write';
  assert.ok(workflow.includes(focused));
  assert.ok(workflow.indexOf(focused) < workflow.indexOf(publish));
  const steps = workflow.split(/\n      - /);
  const tokenSteps = steps.filter((step) => step.includes('GH_TOKEN'));
  assert.equal(tokenSteps.length, 1);
  assert.ok(tokenSteps[0].includes(publish));
  assert.match(tokenSteps[0], /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.equal((workflow.match(/github\.token/g) || []).length, 1);
  assert.doesNotMatch(workflow, /pull_request|pull_request_target|contents: write|npm (?:ci|install)|fetch-for-human-review|reverify\.mjs|fetch-models|probe\.mjs|verify-quotes|check-sources/);
  assert.doesNotMatch(workflow, /continue-on-error|\|\|\s*true/);
  for (const line of workflow.split('\n').filter((line) => line.trimStart().startsWith('run:'))) {
    assert.ok(!line.includes('${{'), 'commands must not interpolate event or issue data');
  }
});

test('write CLI bounds subprocesses and keeps child diagnostics private', () => {
  const output = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    import { pathToFileURL } from 'node:url';
    let ghCalls = 0;
    childProcess.execFileSync = (command, args, options) => {
      assert.equal(options.encoding, 'utf8');
      assert.equal(options.timeout, 30000);
      assert.equal(options.maxBuffer, 1024 * 1024);
      assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe']);
      assert.ok(!options.shell);
      if (command === 'git') {
        assert.deepEqual(args, ['rev-parse', 'HEAD']);
        return ${JSON.stringify(SHA)} + '\\n';
      }
      assert.equal(command, 'gh');
      ghCalls++;
      throw new Error('fake-secret-token in child diagnostic');
    };
    syncBuiltinESMExports();
    process.argv = [process.execPath, ${JSON.stringify(CLI)}, '--write'];
    await import(pathToFileURL(process.argv[1]));
    assert.equal(ghCalls, 1);
  `], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
  assert.equal(output.status, 1);
  assert.equal(output.stdout, '');
  assert.equal(output.stderr, 'Worklist refresh failed. Check arguments, git HEAD, and access to open issue #4.\n');
});
