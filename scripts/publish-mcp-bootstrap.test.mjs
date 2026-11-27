// The one-time first npm publication of packages/mcp (publish-mcp.yml): its guard shell with offline
// registry responses, and the workflow's shape (manual trigger, token and OIDC only in the gated job).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { makeTmpDir } from './lib/tmp.mjs';

const workflow = readFileSync(new URL('../.github/workflows/publish-mcp.yml', import.meta.url), 'utf8');
const skip = process.platform === 'win32' ? 'release shell is checked on Linux' : false;

function job(name) {
  const marker = `\n  ${name}:\n`;
  assert.ok(workflow.includes(marker), `missing job ${name}`);
  return workflow.slice(workflow.indexOf(marker) + 1).split(/\n(?=  [a-z][\w-]*:\n)/)[0];
}

function runGuard({ npm = '404', enabled = 'true', ref = 'refs/heads/main', serverVersion = '1.2.3', packageVersion = '1.2.3', privatePackage = false } = {}) {
  const root = makeTmpDir('mcp-bootstrap-');
  const dir = join(root, 'packages', 'mcp');
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'scripts/check-mcp-bootstrap.sh'), readFileSync(new URL('./check-mcp-bootstrap.sh', import.meta.url)));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@scope/test-mcp', version: '1.2.3', private: privatePackage }));
  writeFileSync(join(dir, 'server.json'), JSON.stringify({ version: serverVersion, packages: [{ version: packageVersion }] }));
  const requests = join(dir, 'requests');
  writeFileSync(requests, '');
  writeFileSync(join(dir, 'curl'), `#!/usr/bin/env bash
set -euo pipefail
url="\${!#}"
printf '%s\\n' "$url" >> "$REQUEST_LOG"
[ "$url" = 'https://registry.npmjs.org/%40scope%2Ftest-mcp/1.2.3' ] || { echo "unexpected registry request: $url" >&2; exit 90; }
[ "$NPM_STATUS" != 'network-error' ] || exit 7
printf '%s' "$NPM_STATUS"
`, { mode: 0o755 });
  const result = spawnSync('bash', ['../../scripts/check-mcp-bootstrap.sh'], {
    cwd: dir, encoding: 'utf8', timeout: 5000,
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, REQUEST_LOG: requests, NPM_STATUS: npm, NPM_PUBLISH_ENABLED: enabled, GITHUB_REF: ref },
  });
  if (result.error) throw result.error;
  return { ...result, requests: readFileSync(requests, 'utf8').trim().split('\n').filter(Boolean) };
}

test('bootstrap guard passes only when npm answers 404 for the exact version', { skip }, () => {
  const ok = runGuard();
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.requests.length, 1);
  for (const npm of ['200', '401', '429', '503', 'network-error']) {
    assert.notEqual(runGuard({ npm }).status, 0, `npm ${npm} must stop the bootstrap`);
  }
});

for (const options of [{ enabled: '' }, { enabled: 'TRUE' }, { ref: 'refs/heads/feat/x' }, { serverVersion: '9.9.9' }, { packageVersion: '9.9.9' }, { privatePackage: true }]) {
  test(`bootstrap guard rejects ${JSON.stringify(options)} before registry access`, { skip }, () => {
    const result = runGuard(options);
    assert.notEqual(result.status, 0);
    assert.deepEqual(result.requests, []);
  });
}

test('the bootstrap runs only by hand, from main, behind the enablement switch and the release environment', () => {
  const on = workflow.slice(workflow.indexOf('\non:\n') + 1).split(/\n(?=[a-z])/)[0];
  assert.deepEqual(on.trim().split('\n').map((l) => l.trim()), ['on:', 'workflow_dispatch:']);
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.match(job('test'), /if: \$\{\{ vars\.NPM_PUBLISH_ENABLED == 'true' && github\.ref == 'refs\/heads\/main' \}\}/);
  assert.match(job('publish'), /needs: test\n/);
  assert.match(job('publish'), /environment: release-mcp\n/);
});

test('the npm token and OIDC reach only the publish job, never dependency installation', () => {
  const uncommented = (text) => text.replace(/\s+#.*$/gm, '');
  const testJob = uncommented(job('test'));
  const publishJob = uncommented(job('publish'));
  assert.doesNotMatch(testJob, /secrets\.|id-token/);
  assert.doesNotMatch(publishJob, /npm (?:ci|install(?! --ignore-scripts)|test|run)\b/);
  assert.match(publishJob, /permissions:\n {6}contents: read\n {6}id-token: write/);
  assert.equal((workflow.match(/secrets\.NPM_TOKEN/g) ?? []).length, 1);
  assert.match(publishJob, /npm publish "\$RUNNER_TEMP"\/mcp-package\/\*\.tgz --ignore-scripts --provenance --access public/);
});
