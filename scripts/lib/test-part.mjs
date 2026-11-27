// test-part.mjs — run one part of a long test file in its own process (scripts/run-tests.mjs).
//
// `node --test` runs files in parallel but the tests of one file one after another, so the longest file sets the floor
// of the whole suite (build.test.mjs: about 80 s of a 110 s run). A file listed in SPLIT_FILES imports `test` and
// `describe` from here instead of node:test. Without a part selected (a plain `node --test scripts/build.test.mjs`)
// they ARE node:test's, unchanged. With a part selected, the file keeps every k-th top-level test or describe block
// (counted in source order) and leaves the others to the other parts, so the parts together run each test exactly
// once. A describe block stays whole: its hooks and its tests go to the same part.
//
// The part is chosen by the wrapper file run-tests.mjs writes (partWrapperSource), never by an environment variable:
// node --test gives every file the same environment, and a variable left set would silently drop tests.
import * as nodeTest from 'node:test';

const KEY = Symbol.for('free-llm-api-hub.test-part');

/** The part this process runs: { index, total } with 1 <= index <= total, or null (run everything). */
export function currentPart(scope = globalThis) {
  const part = scope[KEY];
  if (!part) return null;
  const { index, total } = part;
  if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || index < 1 || index > total) {
    throw new Error(`invalid test part ${JSON.stringify(part)}`);
  }
  return { index, total };
}

/** Wraps node:test's test and describe so only the top-level units of one part register. Exported for its own test. */
export function partitioned(api, part) {
  if (!part) return { test: api.test, describe: api.describe };
  let unit = 0; // top-level units seen so far
  let depth = 0; // > 0 while a kept describe block registers its children
  const mine = () => (unit++ % part.total) === part.index - 1;
  const wrap = (fn, isSuite) => {
    const wrapped = (...args) => {
      if (depth > 0) return fn(...args);
      if (!mine()) return undefined;
      if (!isSuite) return fn(...args);
      // describe(name?, options?, body): the body registers the children synchronously; let them through.
      // A Node that ran the body later would count the children as top-level units and drop some: fail instead.
      const at = args.findLastIndex((a) => typeof a === 'function');
      if (at === -1) return fn(...args);
      const body = args[at];
      let ran = false;
      args[at] = function partBody(...inner) {
        ran = true;
        depth++;
        try { return body.apply(this, inner); } finally { depth--; }
      };
      const result = fn(...args);
      if (!ran) throw new Error('test-part: a describe body did not run synchronously, so this file cannot be split into parts');
      return result;
    };
    for (const variant of ['skip', 'todo', 'only']) {
      if (typeof fn[variant] === 'function') wrapped[variant] = wrap(fn[variant].bind(fn), isSuite);
    }
    return wrapped;
  };
  return { test: wrap(api.test, false), describe: wrap(api.describe, true) };
}

/** The source of a wrapper file that runs part `index` of `total` of the test file at `fileUrl`. */
export function partWrapperSource(fileUrl, index, total) {
  return `globalThis[Symbol.for('free-llm-api-hub.test-part')] = { index: ${Number(index)}, total: ${Number(total)} };\n`
    + `await import(${JSON.stringify(String(fileUrl))});\n`;
}

const selected = partitioned(nodeTest, currentPart());
export const test = selected.test;
export const describe = selected.describe;
export const { before, after, beforeEach, afterEach } = nodeTest;
