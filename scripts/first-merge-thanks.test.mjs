import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTmpDir } from './lib/tmp.mjs';

const skip = process.platform === 'win32' ? 'workflow shell, checked on Linux' : false;
const workflow = readFileSync(new URL('../.github/workflows/first-merge-thanks.yml', import.meta.url), 'utf8');
const script = workflow.split('        run: |\n')[1].split('\n').map((line) => line.replace(/^          /, '')).join('\n');
function run(author, type = 'User') {
  const dir = makeTmpDir('thanks-workflow-');
  const log = join(dir, 'calls');
  // Run the actual workflow shell with a local gh double; no GitHub calls.
  writeFileSync(join(dir, 'gh'), '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$CALL_LOG"\nif [[ "$*" == *"--paginate"* ]]; then printf \'[{"user":{"login":"outside-contributor"},"merged_at":"2026-01-01"}]\'; fi\n', { mode: 0o755 });
  const result = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: {
    ...process.env, PATH: `${dir}:${process.env.PATH}`, CALL_LOG: log,
    AUTHOR: author, AUTHOR_TYPE: type, GH_TOKEN: '', REPO: 'test/repo', NUMBER: '1',
  } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return existsSync(log) ? readFileSync(log, 'utf8') : '';
}
for (const author of ['pacocartones', 'LeonMAG']) {
  test(`first-merge thanks makes no API call for maintainer ${author}`, { skip }, () => {
    assert.equal(run(author), '');
  });
}
test('first-merge thanks skips bots and still thanks a first external contribution', { skip }, () => {
  assert.equal(run('dependabot[bot]', 'Bot'), '');
  assert.match(run('outside-contributor'), /-X POST repos\/test\/repo\/issues\/1\/comments/);
});
