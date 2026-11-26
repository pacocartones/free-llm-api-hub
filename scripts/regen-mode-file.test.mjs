// .github/regen-mode is the regeneration mode a pull request from a fork runs under: GitHub passes no repository
// variables to those runs, so verify.yml reads this file from the base branch when vars.REGEN_MODE is empty
// (docs/regeneration-bot.md). A typo here would silently put every outside contributor back on the strict gate, so the
// file must hold exactly one mode that parseMode() accepts, spelled as parseMode() returns it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MODES, parseMode } from './lib/regenerate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('.github/regen-mode holds one valid regeneration mode', () => {
  const raw = readFileSync(join(ROOT, '.github/regen-mode'), 'utf8');
  const value = raw.replace(/\r?\n$/, '');
  assert.ok(MODES.includes(value), `.github/regen-mode must be one of ${MODES.join(', ')} on a single line, got ${JSON.stringify(raw)}`);
  assert.equal(parseMode(raw), value, 'parseMode() reads the file as written');
});
