#!/usr/bin/env node
// Validates server.json against the MCP registry's official schema (a pinned copy in
// schema/server.schema.json; refresh it together with the "$schema" URL in server.json) and
// checks that it agrees with package.json. A server.json the registry would reject must fail
// here, before an npm publish that could not be followed by the registry entry.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(readFileSync(join(root, f), 'utf8'));
const server = read('server.json');
const pkg = read('package.json');
const schema = read('schema/server.schema.json');

const problems = [];
// Formats are not checked by Ajv (no ajv-formats dependency); the URLs are checked by hand below.
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const validate = ajv.compile(schema);
if (!validate(server)) {
  for (const e of validate.errors) problems.push(`schema: ${e.instancePath || '/'} ${e.message}`);
}
if (server.$schema && !server.$schema.includes('/schemas/')) problems.push('server.json "$schema" is not an official schema URL');
if (server.name !== pkg.mcpName) problems.push(`server.json name (${server.name}) differs from package.json mcpName (${pkg.mcpName})`);
if (server.version !== pkg.version) problems.push(`server.json version (${server.version}) differs from package.json version (${pkg.version})`);
for (const [label, value] of [['websiteUrl', server.websiteUrl], ['repository.url', server.repository?.url]]) {
  try { new URL(value); } catch { problems.push(`${label} is not a valid URL (${value})`); }
}
const npm = (server.packages || []).find((p) => p.registryType === 'npm');
if (!npm) problems.push('server.json has no npm package');
else {
  if (npm.identifier !== pkg.name) problems.push(`npm identifier (${npm.identifier}) differs from package name (${pkg.name})`);
  if (npm.version !== pkg.version) problems.push(`npm package version (${npm.version}) differs from package.json version (${pkg.version})`);
}

if (problems.length) {
  console.error(problems.map((p) => `server.json: ${p}`).join('\n'));
  process.exit(1);
}
console.log(`server.json OK (${server.name} ${server.version})`);
