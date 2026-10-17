import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchStars, statsText } from './refresh-stars.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const answer = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('fetchStars: a good answer gives the integer and nothing else', async () => {
  assert.deepEqual(await fetchStars({ fetchFn: answer(200, { stargazers_count: 65 }) }), { stars: 65 });
});
test('fetchStars: a refusal, a missing or odd count, a network error and a body that is not JSON each give a problem and no number', async () => {
  for (const fetchFn of [
    answer(403, {}), answer(500, {}), answer(200, {}), answer(200, { stargazers_count: '65' }), answer(200, { stargazers_count: -1 }),
    async () => { throw new Error('offline'); },
    async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }),
  ]) {
    const r = await fetchStars({ fetchFn });
    assert.equal(r.stars, undefined);
    assert.equal(typeof r.problem, 'string');
  }
});
test('fetchStars: the token goes in the authorization header only when there is one', async () => {
  let seen;
  const spy = async (url, init) => { seen = init.headers; return { ok: true, status: 200, json: async () => ({ stargazers_count: 1 }) }; };
  await fetchStars({ fetchFn: spy, token: 'tkn' });
  assert.equal(seen.authorization, 'Bearer tkn');
  await fetchStars({ fetchFn: spy });
  assert.equal('authorization' in seen, false);
});
test('statsText: the shape build.mjs reads', () => {
  assert.deepEqual(JSON.parse(statsText(65, '2026-10-16')), { stars: 65, as_of: '2026-10-16' });
  assert.ok(statsText(65, '2026-10-16').endsWith('\n'));
});
test('the deploy workflow refreshes the count before it builds, and runs every day', () => {
  const yml = readFileSync(join(ROOT, '.github/workflows/pages.yml'), 'utf8');
  assert.match(yml, /^\s+schedule:\s*\n\s+- cron: '[^']+'/m);
  const refresh = yml.indexOf('node scripts/refresh-stars.mjs --keep-on-failure');
  const build = yml.indexOf('node scripts/build.mjs');
  assert.ok(refresh > 0 && build > refresh, 'the refresh step must come before the build step');
  assert.match(yml, /GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
});
