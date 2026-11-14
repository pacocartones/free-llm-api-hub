import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTmpDir } from './lib/tmp.mjs';
import { privateTree } from './lib/private-tree.mjs';
import { schemaDocs } from './schema-docs.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = join(ROOT, 'scripts/schema-docs.mjs');
const CHECK = join(ROOT, 'scripts/check-generated.mjs');
const TARGETS = join(ROOT, 'scripts/generated-targets.mjs');
const SCHEMA = JSON.parse(readFileSync(join(ROOT, 'data/schema.json'), 'utf8'));
const fixture = () => ({
  $defs: {
    tristate: { type: ['boolean', 'null'], description: 'Shared definition, not a property description.' },
    commercial: { anyOf: [{ $ref: '#/$defs/tristate' }, { const: 'conditional' }] },
    provider: {
      required: ['slug'],
      properties: {
        slug: { type: 'string', pattern: '^[a-z]+$', description: 'Stable identifier.' },
        phone: { $ref: '#/$defs/tristate' },
        commercial: { $ref: '#/$defs/commercial' },
        tier: { type: ['integer', 'null'], minimum: 0, maximum: 4 },
        models: { type: ['array', 'null'], uniqueItems: true, items: { type: 'string', enum: ['a', 'b'] } },
        limits: { type: ['object', 'null'], required: ['count'], properties: {
          count: { type: 'integer', minimum: 1, description: 'Published allowance.' },
        } },
      },
    },
  },
});

const row = (doc, name) => doc.split('\n').find((line) => line.startsWith(`| \`${name}\` |`));

test('field rows distinguish omission from null and expose referenced unions and constraints', () => {
  const doc = schemaDocs(fixture());
  assert.equal(row(doc, 'slug'), '| `slug` | string | No | Yes | Pattern: <code>^[a-z]+$</code> | Stable identifier. |');
  assert.equal(row(doc, 'phone'), '| `phone` | boolean | Yes | No | — | No description in schema. |');
  assert.match(row(doc, 'commercial'), /boolean or string \| Yes \| No \|.*"conditional"/);
  assert.match(row(doc, 'tier'), /integer \| Yes \| No \| Minimum: 0; maximum: 4/);
  assert.match(row(doc, 'models'), /array \| Yes \| No \|.*Unique items.*Items: string.*"a".*"b"/);
  assert.match(row(doc, 'limits.count'), /integer \| No \| Yes \| Minimum: 1 \| Published allowance/);
});

test('every current provider and nested property gets exactly one row, in schema order', () => {
  const doc = schemaDocs(SCHEMA);
  const names = doc.split('\n').filter((line) => line.startsWith('| `')).map((line) => line.split('`')[1]);
  const expected = [];
  function collect(properties, prefix = '') {
    for (const [name, value] of Object.entries(properties)) {
      expected.push(prefix + name);
      if (value.properties) collect(value.properties, `${prefix}${name}.`);
    }
  }
  // Top-level table first; nested sections follow, each in schema order.
  const top = Object.keys(SCHEMA.$defs.provider.properties);
  collect(SCHEMA.$defs.provider.properties);
  assert.deepEqual(names.slice(0, top.length), top);
  assert.equal(names.length, expected.length);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual([...names].sort(), expected.sort());
});

test('description changes affect only the corresponding content, without inventing missing meanings', () => {
  const schema = fixture();
  const before = schemaDocs(schema);
  schema.$defs.provider.properties.slug.description = 'Updated source wording.';
  const after = schemaDocs(schema);
  assert.notEqual(before, after);
  assert.match(row(after, 'slug'), /Updated source wording/);
  assert.equal(before.replace('Stable identifier.', 'Updated source wording.'), after);
  assert.doesNotMatch(after, /Shared definition, not a property description/);
});

test('description Markdown and HTML cannot split rows or inject markup', () => {
  const schema = fixture();
  schema.$defs.provider.properties.slug.description = 'A | B\r\n<script>x</script> & `literal`';
  const doc = schemaDocs(schema);
  assert.match(row(doc, 'slug'), /A &#124; B<br>&lt;script&gt;x&lt;\/script&gt; &amp; `literal`/);
  assert.equal(doc.split('\n').filter((line) => line.startsWith('| `slug`')).length, 1);
});

test('conditional presence and type refinements are documented separately from base nullability', () => {
  const doc = schemaDocs(SCHEMA);
  assert.match(row(doc, 'commercial_ok_condition'), /string \| Yes \| Conditional/);
  assert.match(row(doc, 'last_verified'), /string \| Yes \| Conditional/);
  assert.match(doc, /commercial_ok.*"conditional".*commercial_ok_condition/s);
  assert.match(doc, /verified.*true.*last_verified.*Type: string/s);
  assert.match(doc, /Conditional rules can narrow the types and nullability/);
});

test('CLI accepts an alternate schema/output and repeated generation is byte-identical', () => {
  const dir = makeTmpDir('flah-schema-cli-');
  const input = join(dir, 'schema.json');
  const output = join(dir, 'schema.md');
  writeFileSync(input, JSON.stringify(fixture()));
  const run = () => execFileSync(process.execPath, [CLI, input, output], { cwd: dir });
  run();
  const first = readFileSync(output, 'utf8');
  run();
  assert.equal(readFileSync(output, 'utf8'), first);
  assert.match(row(first, 'slug'), /Stable identifier/);
});

test('both drift entry points catch an untracked reference, a regenerated stale reference and deletion', () => {
  const dir = makeTmpDir('flah-schema-drift-');
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  const check = () => spawnSync(process.execPath, [CHECK], { cwd: dir, encoding: 'utf8' });
  const targets = (...args) => execFileSync(process.execPath, [TARGETS, ...args], { cwd: dir, encoding: 'utf8' }).trim().split(/\s+/);
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  mkdirSync(join(dir, 'docs'));
  const input = join(dir, 'schema.json');
  const output = join(dir, 'docs/schema.md');
  const schema = fixture();
  writeFileSync(input, JSON.stringify(schema));
  const generate = () => execFileSync(process.execPath, [CLI, input, output]);
  generate();
  assert.ok(targets().includes('docs/schema.md'));
  assert.ok(targets('--untracked').includes('docs/schema.md'));
  assert.equal(check().status, 1, 'forgotten git add must fail');
  git('add', '.'); git('commit', '-qm', 'reference');
  assert.equal(check().status, 0);
  schema.$defs.provider.properties.slug.description = 'Changed description.';
  writeFileSync(input, JSON.stringify(schema)); generate();
  assert.equal(check().status, 1, 'fresh generation exposes the stale committed reference');
  assert.notEqual(spawnSync('git', ['diff', '--quiet', '--', ...targets()], { cwd: dir }).status, 0, 'CI target list catches the same drift');
  git('add', '.'); git('commit', '-qm', 'refresh reference');
  assert.equal(check().status, 0);
  git('rm', '--quiet', 'docs/schema.md');
  // git rm stages deletion; model an unstaged missing generated output instead.
  git('reset', '--quiet', 'HEAD', '--', 'docs/schema.md');
  assert.equal(check().status, 1);
});

test('build regenerates schema documentation when a source description changes', () => {
  const dir = privateTree(ROOT);
  const input = join(dir, 'data/schema.json');
  const schema = JSON.parse(readFileSync(input, 'utf8'));
  schema.$defs.provider.properties.slug.description = 'Description edited in an isolated build test.';
  writeFileSync(input, JSON.stringify(schema));
  execFileSync(process.execPath, [join(dir, 'scripts/build.mjs')], { cwd: dir, stdio: 'pipe' });
  assert.match(readFileSync(join(dir, 'docs/schema.md'), 'utf8'), /Description edited in an isolated build test/);
});
