// Exercise the release decision's actual shell with offline registry responses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { makeTmpDir } from './lib/tmp.mjs';

const workflow = readFileSync(new URL('../.github/workflows/release-mcp.yml', import.meta.url), 'utf8');
const skip = process.platform === 'win32' ? 'release shell is checked on Linux' : false;

function job(name) {
  const marker = `\n  ${name}:\n`;
  assert.ok(workflow.includes(marker), `missing job ${name}`);
  return workflow.slice(workflow.indexOf(marker) + 1).split(/\n(?=  [a-z][\w-]*:\n)/)[0];
}
const steps = (name) => job(name).split(/^      - /m).slice(1);
function decisionScript(phase) {
  const decide = steps(phase).find((step) => step.startsWith('id: decide\n'));
  assert.ok(decide, `missing release decision in ${phase}`);
  const block = decide.split('\n        run: |\n')[1];
  return block ? block.replace(/^          /gm, '') : decide.match(/^        run: (.+)$/m)[1];
}

function runDecision({ npm = '200', mcp = '404', privatePackage = false, tag = 'mcp-v1.2.3', serverVersion = '1.2.3', phase = 'check', enabled = 'true' } = {}) {
  const root = makeTmpDir('mcp-release-');
  const dir = join(root, 'packages', 'mcp');
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'scripts/check-mcp-release.sh'), readFileSync(new URL('./check-mcp-release.sh', import.meta.url)));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@scope/test-mcp', version: '1.2.3', private: privatePackage }));
  writeFileSync(join(dir, 'server.json'), JSON.stringify({ name: 'io.github.example/test-mcp', version: serverVersion }));
  const output = join(dir, 'outputs');
  const requests = join(dir, 'requests');
  writeFileSync(output, '');
  writeFileSync(requests, '');
  writeFileSync(join(dir, 'curl'), `#!/usr/bin/env bash
set -euo pipefail
url="\${!#}"
printf '%s\\n' "$url" >> "$REQUEST_LOG"
case "$url" in
  'https://registry.npmjs.org/%40scope%2Ftest-mcp/1.2.3') status="$NPM_STATUS" ;;
  'https://registry.modelcontextprotocol.io/v0.1/servers/io.github.example%2Ftest-mcp/versions/1.2.3?include_deleted=true') status="$MCP_STATUS" ;;
  *) echo "unexpected registry request: $url" >&2; exit 90 ;;
esac
[ "$status" != 'network-error' ] || exit 7
printf '%s' "$status"
`, { mode: 0o755 });
  // The old decision uses npm view; never let the regression test contact npm.
  writeFileSync(join(dir, 'npm'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', decisionScript(phase)], {
    cwd: dir, encoding: 'utf8', timeout: 5000,
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_OUTPUT: output, GITHUB_REF_NAME: tag,
      REQUEST_LOG: requests, NPM_STATUS: npm, MCP_STATUS: mcp, NPM_PUBLISH_ENABLED: enabled },
  });
  if (result.error) throw result.error;
  return { ...result, outputs: Object.fromEntries(readFileSync(output, 'utf8').trim().split('\n').filter(Boolean).map((line) => line.split('='))),
    requests: readFileSync(requests, 'utf8').trim().split('\n').filter(Boolean) };
}

function condition(text, outputs, freshOutputs = outputs) {
  const expression = text.match(/^\s+if: \$\{\{ (.+) \}\}$/m)?.[1];
  // These release conditions are the GitHub expression subset shared with JS.
  return expression ? new Function('needs', 'steps', `return Boolean(${expression});`)({ check: { outputs } }, { decide: { outputs: freshOutputs } }) : true;
}

for (const [npm, mcp, npmNeeded, mcpNeeded] of [
  ['404', '404', 'true', 'true'],
  ['200', '404', 'false', 'true'],
  ['404', '200', 'true', 'false'],
  ['200', '200', 'false', 'false'],
]) {
  test(`release recovery: npm ${npm}, MCP ${mcp}`, { skip }, () => {
    const result = runDecision({ npm, mcp });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.outputs, { npm_needed: npmNeeded, mcp_needed: mcpNeeded });
    assert.equal(result.requests.length, 2, 'query both exact versions, including URL-encoded names');

    // Follow the real job-output wiring and evaluate the actual job/step conditions.
    const outputs = Object.fromEntries([...job('check').matchAll(/^      (\w+): \$\{\{ steps\.decide\.outputs\.(\w+) \}\}$/gm)]
      .map(([, name, source]) => [name, result.outputs[source]]));
    const anyNeeded = npmNeeded === 'true' || mcpNeeded === 'true';
    assert.equal(condition(job('test'), outputs), anyNeeded, 'test either recovery path');
    assert.equal(condition(job('publish'), outputs), anyNeeded, 'publish either missing destination');
    const publishSteps = steps('publish');
    const npmStep = publishSteps.find((step) => step.includes('run: npm publish '));
    assert.ok(npmStep, 'npm publication step exists');
    assert.equal(condition(npmStep, outputs), npmNeeded === 'true', 'never republish an existing npm version');
    for (const title of ['Install mcp-publisher', 'Publish to the MCP registry']) {
      const step = publishSteps.find((item) => item.startsWith(`name: ${title}`));
      assert.ok(step, `${title} exists`);
      assert.equal(condition(step, outputs), mcpNeeded === 'true', 'never republish an existing MCP version');
    }
  });
}

for (const target of ['npm', 'mcp']) {
  for (const status of ['401', '429', '503', 'network-error']) {
    test(`${target} lookup ${status} fails closed`, { skip }, () => {
      const result = runDecision({ [target]: status });
      assert.notEqual(result.status, 0, 'an unavailable registry must not be treated as a missing version');
    });
  }
}

for (const options of [{ privatePackage: true }, { tag: 'mcp-v9.9.9' }, { serverVersion: '9.9.9' }]) {
  test(`release guards reject ${JSON.stringify(options)} before registry access`, { skip }, () => {
    const result = runDecision(options);
    assert.notEqual(result.status, 0, 'private or mismatched releases cannot publish');
    assert.deepEqual(result.requests, []);
  });
}

for (const mcp of ['404', '200']) {
  test(`rerunning the publish job rechecks npm and MCP (MCP ${mcp})`, { skip }, () => {
    const publishSteps = steps('publish');
    assert.ok(publishSteps.some((step) => /(?:^|\n        )id: decide\n/.test(step)), 'the publish job must refresh registry state after approval/on a failed-job rerun');
    const initial = { npm_needed: 'true', mcp_needed: 'true' };
    const result = runDecision({ npm: '200', mcp, phase: 'publish' });
    assert.equal(result.status, 0, result.stderr);
    const fresh = result.outputs;
    const npmStep = publishSteps.find((step) => step.includes('run: npm publish '));
    assert.equal(condition(npmStep, initial, fresh), false, 'already-published npm must be skipped even when check outputs are stale');
    const mcpStep = publishSteps.find((step) => step.startsWith('name: Publish to the MCP registry'));
    assert.equal(condition(mcpStep, initial, fresh), mcp === '404', 'only a still-missing MCP version is published');
  });
}

for (const phase of ['check', 'publish']) {
  for (const enabled of ['', 'false', 'TRUE']) {
    test(`${phase}: public package still requires explicit publication enablement (${JSON.stringify(enabled)})`, { skip }, () => {
      const result = runDecision({ phase, enabled, npm: '404', mcp: '404' });
      assert.notEqual(result.status, 0, 'disabled publication must fail before querying registries');
      assert.deepEqual(result.requests, []);
    });
  }
}

// Exercise the publishing command offline: a source-directory publish must not
// substitute for the archive tested in the no-OIDC job.
test('publication consumes the tested archive with provenance and lifecycle scripts disabled', { skip }, () => {
  const root = makeTmpDir('mcp-publish-command-');
  const artifacts = join(root, 'mcp-package');
  mkdirSync(artifacts);
  const tarball = join(artifacts, 'free-llm-api-hub-mcp-1.2.3.tgz');
  writeFileSync(tarball, 'fixture archive');
  const log = join(root, 'args');
  writeFileSync(join(root, 'npm'), '#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$ARG_LOG"\n', { mode: 0o755 });
  const command = steps('publish').find((step) => step.includes('run: npm publish ')).match(/^        run: (.+)$/m)[1];
  const result = spawnSync('bash', ['-e', '-c', command], { cwd: root, encoding: 'utf8',
    env: { ...process.env, PATH: `${root}:${process.env.PATH}`, RUNNER_TEMP: root, ARG_LOG: log },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n'), [
    'publish', tarball, '--ignore-scripts', '--provenance', '--access', 'public',
  ]);
});
