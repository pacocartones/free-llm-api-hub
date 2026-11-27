 import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function parseRootTokens(css) {
  const match = css.match(/^:root \{([\s\S]*?)^\}/m);
  assert.ok(match, 'found :root block in site/styles.css');
  const cleaned = match[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens = new Map();
  for (const [, name, value] of cleaned.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    tokens.set(name, value.trim());
  }
  return tokens;
}

function resolveToken(tokens, name, seen = new Set()) {
  assert.ok(tokens.has(name), `${name} is not defined in :root of site/styles.css`);
  assert.ok(!seen.has(name), `circular alias involving ${name} in :root of site/styles.css`);
  seen.add(name);
  const raw = tokens.get(name);
  const alias = raw.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/i);
  if (alias) return resolveToken(tokens, alias[1], seen);
  return raw;
}

test('consent banner fallback colours match the dark palette tokens in site/styles.css :root', () => {
  const css = readFileSync(new URL('../site/styles.css', import.meta.url), 'utf8');
  const consent = readFileSync(new URL('./lib/consent.client.js', import.meta.url), 'utf8');
  const tokens = parseRootTokens(css);

  const fallbacks = [...consent.matchAll(/var\(\s*(--[a-z0-9-]+)\s*,\s*(#[0-9a-f]{3,8})\s*\)/gi)];
  assert.ok(fallbacks.length > 0, 'found var(--name,#hex) fallbacks in scripts/lib/consent.client.js');

  const mismatches = [];
  for (const [, name, hex] of fallbacks) {
    const expected = resolveToken(tokens, name);
    if (hex.toLowerCase() !== expected.toLowerCase()) {
      mismatches.push(`${name}: fallback ${hex} !== :root ${expected}`);
    }
  }
  assert.equal(mismatches.length, 0, `fallback colour mismatch:\n${mismatches.join('\n')}`);
});