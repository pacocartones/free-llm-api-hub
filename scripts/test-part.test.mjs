// The suite split (lib/test-part.mjs, lib/test-files.mjs, run-tests.mjs and the Windows shards in verify.yml): the parts
// and the shards together must run every test exactly once, never fewer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { currentPart, partitioned, partWrapperSource } from './lib/test-part.mjs';
import { parseShard, shardUnits, SPLIT_FILES, testFiles, testUnits } from './lib/test-files.mjs';
import { makeTmpDir } from './lib/tmp.mjs';

const ROOT = join(import.meta.dirname, '..');

// A stand-in for node:test that records what registers, with describe bodies run synchronously as node:test does.
function recorder() {
  const seen = [];
  const api = {
    test: (name) => { seen.push(name); },
    describe: (name, ...rest) => { seen.push(`suite ${name}`); rest.findLast((a) => typeof a === 'function')(); },
  };
  api.test.skip = (name) => { seen.push(`skip ${name}`); };
  return { api, seen };
}

function registerSample({ test: t, describe: d }) {
  t('a');
  d('s', () => { t('s1'); t('s2'); });
  t('b');
  t.skip('c');
  d('options', { concurrency: 1 }, () => { t('o1'); });
  t('d');
}

test('without a part the wrappers are node:test itself', () => {
  const { api } = recorder();
  const plain = partitioned(api, null);
  assert.equal(plain.test, api.test);
  assert.equal(plain.describe, api.describe);
});

test('the parts together register every top-level unit exactly once, and a describe block stays whole', () => {
  const all = recorder();
  registerSample(all.api);
  for (const total of [1, 2, 3, 4, 7]) {
    const union = [];
    for (let index = 1; index <= total; index++) {
      const one = recorder();
      registerSample(partitioned(one.api, { index, total }));
      if (one.seen.includes('suite s')) assert.ok(one.seen.includes('s1') && one.seen.includes('s2'), 'the children go with their block');
      union.push(...one.seen);
    }
    assert.deepEqual(union.sort(), [...all.seen].sort(), `${total} part(s): nothing lost, nothing twice`);
  }
});

test('a describe body that does not run at once fails loudly instead of dropping tests', () => {
  const api = { test: () => {}, describe: () => {} };
  const { describe: d } = partitioned(api, { index: 1, total: 2 });
  assert.throws(() => d('late', () => {}), /did not run synchronously/);
});

test('the part comes from the wrapper only, and a malformed one is an error', () => {
  const key = Symbol.for('free-llm-api-hub.test-part');
  assert.equal(currentPart({}), null);
  assert.deepEqual(currentPart({ [key]: { index: 2, total: 3 } }), { index: 2, total: 3 });
  for (const bad of [{ index: 0, total: 3 }, { index: 4, total: 3 }, { index: 1, total: 0 }, { index: '1', total: 2 }]) {
    assert.throws(() => currentPart({ [key]: bad }), /invalid test part/);
  }
});

test('TEST_SHARD is "<index>/<total>" or empty; anything else stops the run instead of running everything', () => {
  assert.equal(parseShard(undefined), null);
  assert.equal(parseShard(''), null);
  assert.deepEqual(parseShard('2/3'), { index: 2, total: 3 });
  for (const bad of ['0/3', '4/3', '1/0', '1', 'a/b', '1/3/5', '-1/3']) assert.throws(() => parseShard(bad), /TEST_SHARD/, bad);
});

test('the shards of the suite hold every unit exactly once, and the parts of a split file land on different shards', () => {
  const units = testUnits(testFiles());
  for (const [file, total] of Object.entries(SPLIT_FILES)) {
    assert.equal(units.filter((u) => u.file === file).length, total, `${file} runs as ${total} parts`);
  }
  assert.equal(units.filter((u) => !u.part).length, testFiles().length - Object.keys(SPLIT_FILES).length);
  const key = (u) => `${u.file}#${u.part?.index ?? 0}`;
  for (const total of [1, 2, 3, 5]) {
    const union = [];
    for (let index = 1; index <= total; index++) union.push(...shardUnits(units, { index, total }).map(key));
    assert.deepEqual(union.sort(), units.map(key).sort(), `${total} shard(s)`);
  }
  for (let index = 1; index <= 3; index++) {
    const files = shardUnits(units, { index, total: 3 }).filter((u) => u.part).map((u) => u.file);
    assert.equal(new Set(files).size, files.length, `shard ${index}/3 holds at most one part of each split file`);
  }
});

test('a split file takes test and describe from lib/test-part.mjs, so its parts do not each run everything', () => {
  for (const file of Object.keys(SPLIT_FILES)) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    assert.match(src, /^import \{[^}]*\btest\b[^}]*\} from '\.\/lib\/test-part\.mjs';$/m, file);
    assert.doesNotMatch(src, /^import[^;]*from 'node:test';$/m, `${file} imports nothing from node:test directly`);
  }
});

test('a file run in parts by the real runner: every test once, in the part the wrapper selects', () => {
  const dir = makeTmpDir('test-part-');
  const fixture = join(dir, 'fixture.test.mjs');
  const lib = pathToFileURL(join(ROOT, 'scripts/lib/test-part.mjs')).href;
  writeFileSync(fixture, [
    `import { test, describe } from ${JSON.stringify(lib)};`,
    ...['t1', 't2', 't3', 't4', 't5'].map((n) => `test('${n}', () => {});`),
    "describe('block', () => { test('b1', () => {}); test('b2', () => {}); });",
  ].join('\n'));
  // Without NODE_TEST_CONTEXT: inside a test, it would make the inner runner talk to this one instead of printing TAP.
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const tap = (file) => execFileSync(process.execPath, ['--test', '--test-reporter=tap', file], { encoding: 'utf8', env });
  const names = (out) => [...out.matchAll(/^\s*ok \d+ - (\S+)$/gm)].map((m) => m[1]).filter((n) => n !== 'block');
  const whole = names(tap(fixture));
  assert.deepEqual(whole.sort(), ['b1', 'b2', 't1', 't2', 't3', 't4', 't5']);
  const union = [];
  for (let index = 1; index <= 2; index++) {
    const wrapper = join(dir, `fixture.part-${index}.test.mjs`);
    writeFileSync(wrapper, partWrapperSource(pathToFileURL(fixture).href, index, 2));
    union.push(...names(tap(wrapper)));
  }
  assert.deepEqual(union.sort(), whole);
});

test('verify.yml: Windows tests is one aggregator over the shards, which together run the whole of npm test', () => {
  const wf = readFileSync(join(ROOT, '.github/workflows/verify.yml'), 'utf8');
  const job = (id) => {
    const start = wf.indexOf(`\n  ${id}:\n`);
    assert.ok(start !== -1, `job ${id} exists`);
    const rest = wf.slice(start + id.length + 5);
    const next = rest.search(/^ {2}[a-z-]+:\n/m);
    return next === -1 ? rest : rest.slice(0, next);
  };
  const shards = job('windows-shards');
  const total = Number(/TEST_SHARD: \$\{\{ matrix\.shard \}\}\/(\d+)/.exec(shards)?.[1]);
  assert.ok(total > 1, 'each shard runs npm test with TEST_SHARD=<shard>/<total>');
  assert.match(shards, new RegExp(`shard: \\[${Array.from({ length: total }, (_, i) => i + 1).join(', ')}\\]`), 'one job per shard, none missing');
  assert.match(shards, /fail-fast: false/);
  assert.match(shards, /runs-on: windows-latest/);
  assert.match(shards, /\n {10}npm test\n/);
  const agg = job('windows-tests');
  assert.match(agg, /^ {4}name: Windows tests\n/, 'the required check keeps its name');
  assert.match(agg, /needs: windows-shards/);
  assert.match(agg, /if: \$\{\{ always\(\) \}\}/, 'it reports even when a shard failed or was cancelled');
  assert.match(agg, /RESULT: \$\{\{ needs\.windows-shards\.result \}\}/);
  assert.match(agg, /\[ "\$RESULT" = success \]/, 'anything but success (failure, cancelled, skipped) fails the check');
  assert.doesNotMatch(agg, /actions\/checkout|npm |node scripts\//, 'the aggregator runs no repository code');
});
