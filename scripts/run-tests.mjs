#!/usr/bin/env node
// Runs every scripts/*.test.mjs with the Node test runner. It expands the pattern itself, so it works on every Node the project supports
// (the engines field says 24 and up, matching .nvmrc and CI) without relying on shell globbing, which differs on Windows.
//
// A file in SPLIT_FILES (lib/test-files.mjs) runs as several processes, each with one part of its tests (lib/test-part.mjs), so the
// longest file no longer sets the floor of the suite. TEST_SHARD="<index>/<total>" runs one shard of the suite (CI's Windows matrix,
// .github/workflows/verify.yml); the shards together run every test exactly once. Without it, everything runs, as before.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { basename, dirname, join } from 'node:path';
import { parseShard, shardUnits, testFiles, testUnits } from './lib/test-files.mjs';
import { partWrapperSource } from './lib/test-part.mjs';
import { makeTmpDir } from './lib/tmp.mjs';
import { crlfFiles, testGitEnv } from './lib/test-tools.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const all = testFiles();
if (!all.length) { console.error('no scripts/*.test.mjs found'); process.exit(1); }

// A working tree with CRLF files fails a large part of the suite for reasons unrelated to any change; say so once instead.
const crlf = crlfFiles(ROOT);
if (crlf.length) {
  console.error(`${crlf.length} tracked text file(s) have CRLF line endings on disk; the repository and the tests expect LF:`);
  for (const file of crlf.slice(0, 10)) console.error(`  ${file}`);
  if (crlf.length > 10) console.error(`  … and ${crlf.length - 10} more (git ls-files --eol | grep w/crlf)`);
  console.error('Save them with LF line endings (or run `git checkout -- <file>` for a file you have not edited), then run the tests again.');
  console.error('See "Windows and WSL" in CONTRIBUTING.md.');
  process.exit(1);
}

let shard;
try { shard = parseShard(process.env.TEST_SHARD); } catch (err) { console.error(err.message); process.exit(2); }
const units = shardUnits(testUnits(all), shard);
if (shard) console.log(`TEST_SHARD ${shard.index}/${shard.total}: ${units.length} unit(s) of the suite`);

// One small wrapper file per part: it selects the part, then imports the real test file.
const wrappers = makeTmpDir('flah-test-parts-');
const files = units.map(({ file, part }) => {
  if (!part) return file;
  const wrapper = join(wrappers, `${basename(file, '.test.mjs')}.part-${part.index}-of-${part.total}.test.mjs`);
  writeFileSync(wrapper, partWrapperSource(pathToFileURL(join(ROOT, file)).href, part.index, part.total));
  return wrapper;
});

const run = spawnSync(process.execPath, ['--test', ...files], { cwd: ROOT, stdio: 'inherit', env: testGitEnv() });
process.exit(run.status === null ? 1 : run.status);
