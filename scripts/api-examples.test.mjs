// The copy-paste examples of the /api/ page and docs/api.md (scripts/lib/api-examples.mjs) must keep working.
// Every JavaScript and Python snippet runs here against the built site/ files, with fetch and urllib.request.urlopen
// replaced by a reader of site/ that refuses any other URL, so nothing reaches the network. The curl snippets run
// too where bash, curl and jq exist (always in the Linux CI job), with the site URL rewritten to file://.
// For each example the languages must print the same lines, so a snippet that silently filters differently fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeTmpDir } from './lib/tmp.mjs';
import { shellSkip } from './lib/test-tools.mjs';
import { API_EXAMPLES, API_EXAMPLES_SITE, apiExamplesMarkdown } from './lib/api-examples.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE_DIR = join(ROOT, 'site');
const NEEDED = ['api/v1/providers.json', 'api/v1/status.json', 'providers.csv', 'llms.txt'];
if (NEEDED.some((f) => !existsSync(join(SITE_DIR, f)))) {
  const run = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
  assert.equal(run.status, 0, `build failed: ${run.stderr}`);
}

const tmp = makeTmpDir('flah-api-examples-');
const lines = (out) => out.replace(/\r\n/g, '\n').split('\n').filter(Boolean);

// JavaScript: a preloaded module swaps fetch for a reader of site/.
const jsStub = join(tmp, 'fetch-stub.mjs');
writeFileSync(jsStub, `import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const SITE = ${JSON.stringify(API_EXAMPLES_SITE + '/')};
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (!url.startsWith(SITE)) throw new Error('example fetched a URL outside the site: ' + url);
  if (init && init.headers) throw new Error('examples send no custom headers (the host refuses the CORS preflight)');
  return new Response(readFileSync(join(process.env.FLAH_SITE_DIR, url.slice(SITE.length))));
};
`);
const runJs = (ex) => {
  const file = join(tmp, `${ex.id}.mjs`);
  writeFileSync(file, ex.js + '\n');
  return spawnSync(process.execPath, ['--import', pathToFileURL(jsStub).href, file], {
    cwd: tmp, encoding: 'utf8', env: { ...process.env, FLAH_SITE_DIR: SITE_DIR },
  });
};

// Python: the snippet runs after a prelude that swaps urllib.request.urlopen for a reader of site/.
const PY_PRELUDE = `import os as _os, urllib.request as _ur
def _urlopen(url, *args, **kwargs):
    url = url if isinstance(url, str) else url.full_url
    site = ${JSON.stringify(API_EXAMPLES_SITE + '/')}
    if not url.startswith(site):
        raise RuntimeError("example fetched a URL outside the site: " + url)
    return open(_os.path.join(_os.environ["FLAH_SITE_DIR"], *url[len(site):].split("/")), "rb")
_ur.urlopen = _urlopen
`;
const python = ['python3', 'python'].find((cmd) => {
  const r = spawnSync(cmd, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() === '3';
});
const pySkip = python ? false : process.env.CI ? false : 'Python 3 is not on PATH (python3 or python); CI runs it';
const runPy = (ex) => {
  const file = join(tmp, `${ex.id}.py`);
  writeFileSync(file, PY_PRELUDE + ex.python + '\n');
  return spawnSync(python || 'python3', ['-I', file], {
    cwd: tmp, encoding: 'utf8', env: { ...process.env, FLAH_SITE_DIR: SITE_DIR, PYTHONIOENCODING: 'utf-8' },
  });
};

// curl: the same command with the site URL pointing at the built files.
const curlSkip = shellSkip('curl examples', ['curl', 'jq']);
const runCurl = (ex) => spawnSync('bash', ['-eo', 'pipefail', '-c', ex.curl.split(API_EXAMPLES_SITE).join(pathToFileURL(SITE_DIR).href)], {
  cwd: tmp, encoding: 'utf8',
});

const ok = (r, what) => {
  assert.equal(r.error, undefined, `${what} could not start: ${r.error}`);
  assert.equal(r.status, 0, `${what} failed:\n${r.stderr}`);
  const out = lines(r.stdout);
  assert.ok(out.length > 0, `${what} printed nothing`);
  return out;
};

for (const ex of API_EXAMPLES) {
  test(`API example "${ex.id}" runs in JavaScript`, () => {
    const out = ok(runJs(ex), 'JavaScript');
    for (const line of out) assert.ok(!/undefined|NaN|\[object Object\]/.test(line), `suspicious output line: ${line}`);
  });

  test(`API example "${ex.id}" runs in Python and prints what JavaScript prints`, { skip: pySkip }, () => {
    assert.deepEqual(ok(runPy(ex), 'Python'), lines(runJs(ex).stdout));
  });

  test(`API example "${ex.id}" runs with curl${ex.sameOutput ? ' and prints what JavaScript prints' : ''}`, { skip: curlSkip }, () => {
    const out = ok(runCurl(ex), 'curl');
    if (ex.sameOutput) assert.deepEqual(out, lines(runJs(ex).stdout));
  });
}

test('every example covers the three languages and the four starting files', () => {
  const files = new Set(API_EXAMPLES.map((ex) => ex.file));
  for (const f of ['providers.json', 'status.json', 'providers.csv', 'llms.txt']) assert.ok(files.has(f), `no example for ${f}`);
  assert.equal(new Set(API_EXAMPLES.map((ex) => ex.id)).size, API_EXAMPLES.length, 'example ids are unique');
  for (const ex of API_EXAMPLES) {
    for (const key of ['curl', 'js', 'python']) assert.ok(ex[key] && ex[key].includes(API_EXAMPLES_SITE), `${ex.id}: ${key} uses the full site URL`);
    assert.ok(!/\b(require|import)\s*\(|from\s+["']/.test(ex.js), `${ex.id}: the JavaScript has no dependencies`);
    const imports = [...ex.python.matchAll(/^(?:import|from)\s+(.+)$/gm)].flatMap((m) => m[1].replace(/\s+import\s+.*/, '').split(/,\s*/));
    for (const mod of imports) assert.ok(['json', 'urllib.request', 'csv', 'io', 're'].includes(mod.trim()), `${ex.id}: Python imports only the standard library (${mod})`);
  }
});

test('the /api/ page and docs/api.md carry the generated examples, not hand copies', () => {
  const doc = readFileSync(join(ROOT, 'docs/api.md'), 'utf8');
  const block = doc.match(/<!-- AUTOGEN:api-examples:start -->\n([\s\S]*?)\n<!-- AUTOGEN:api-examples:end -->/);
  assert.ok(block, 'docs/api.md has the api-examples markers');
  assert.equal(block[1], apiExamplesMarkdown(), 'docs/api.md is in sync with scripts/lib/api-examples.mjs (run npm run build)');
  const page = readFileSync(join(SITE_DIR, 'api/index.html'), 'utf8');
  assert.ok(page.includes('id="examples"') && page.includes('id="mcp"'), 'the API page has the examples and the MCP section');
  for (const ex of API_EXAMPLES) assert.ok(page.includes(`id="example-${ex.id}"`), `the API page shows ${ex.id}`);
  assert.ok(page.includes('packages/mcp') && doc.includes('packages/mcp'), 'both mention the MCP server in packages/mcp');
});
