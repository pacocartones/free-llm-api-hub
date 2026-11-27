#!/usr/bin/env node
// npm run quotes:add -- <slug> [--lang <code>] [--passage-url "<passage>=<page address>"]...
// npm run quotes:add -- <slug> --field <flag> [--lang <code>]
// npm run quotes:add -- <slug> --speed [--lang <code>]
//
// After you write the data_policy row of a provider (its quote, source and note), this reads the source page in its language and writes the
// entries of that provider in data/quotes.json: the sentence, each phrase of the note between « », and the absence check if the note says
// something about the whole page. With --field, it writes instead the sentence of a stated field_checks entry (phone_required,
// card_required, commercial_ok, openai_compatible, multi_account_forbidden or limit_circumvention_forbidden), read on its first source. With --speed, it writes the quote of every published_speed
// entry of the provider, each read on its source. It writes the day, the hash and the method; you never
// type them. It changes nothing else. If something is not on the page it says what and writes nothing.
import { utcToday } from './lib/dates.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { quoteErrors } from './lib/quotes.mjs';
import { entriesFor, fieldEntriesFor, speedEntriesFor, mergeRegistry, readText } from './lib/quotes-add.mjs';
import { FIELD_CHECK_FIELDS } from './lib/field-checks.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const usage = 'usage: npm run quotes:add -- <slug> [--lang <code>] [--passage-url "<passage>=<address>"] | <slug> --field <flag> [--lang <code>] | <slug> --speed [--lang <code>]';
let slug = null; let lang = 'en'; let field = null; let speed = false;
const passageUrls = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--passage-url') {
    const v = args[++i] || ''; const at = v.lastIndexOf('=');
    if (at <= 0) { console.error(usage); process.exit(2); }
    passageUrls[v.slice(0, at)] = v.slice(at + 1);
  } else if (a === '--field') {
    field = args[++i] || '';
    if (!FIELD_CHECK_FIELDS.includes(field)) { console.error(usage); process.exit(2); }
  } else if (a === '--speed') {
    speed = true;
  } else if (a === '--lang') {
    lang = args[++i] || '';
  } else if (a.startsWith('--') || slug) { console.error(usage); process.exit(2); }
  else slug = a;
}
if (!slug || !/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(lang)) { console.error(usage); process.exit(2); }

const data = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const registry = JSON.parse(readFileSync(join(ROOT, 'data/quotes.json'), 'utf8'));
const p = data.providers.find((x) => x.slug === slug);
if (speed && field) { console.error(usage); process.exit(2); }
if (speed) {
  if (!p || !Array.isArray(p.published_speed) || !p.published_speed.length) { console.error(`${slug}: no provider with that slug has published_speed in data/providers.json`); process.exit(2); }
} else if (field) {
  if (!p || !p.field_checks || !p.field_checks[field]) { console.error(`${slug}: no provider with that slug has field_checks.${field} in data/providers.json`); process.exit(2); }
} else if (!p || !p.data_policy) { console.error(`${slug}: no provider with that slug has a data_policy in data/providers.json`); process.exit(2); }

const today = utcToday();
const read = (u) => readText(u, undefined, lang);
const { entries, problems } = speed
  ? await speedEntriesFor(slug, p.published_speed, read, { today, lang })
  : field
  ? await fieldEntriesFor(slug, field, p.field_checks[field], read, { today, lang })
  : await entriesFor(slug, p.data_policy, read, { today, passageUrls, lang });
if (problems.length) { console.error(problems.map((x) => `- ${x}`).join('\n')); console.error('nothing was written'); process.exit(1); }
const next = mergeRegistry(registry, data, slug, entries, { field, speed });
// With --field, only the problems of that sentence stop the write: other field quotes still waiting for their own run (several
// flags recorded in one pull request) are reported by npm test, not here.
const fieldId = field && `${slug}.${field}.sentence`;
const errors = quoteErrors(data, next).filter((e) => (speed ? e.includes(`${slug}.speed.`) || e.includes(`${slug}: the quote of published_speed`) || e.includes(`${slug}: the speed_quote`)
  : !field || e.includes(fieldId) || e.includes(`${slug}: the quote of field_checks.${field} `)));
if (errors.length) { console.error(errors.map((x) => `- ${x}`).join('\n')); console.error('nothing was written'); process.exit(1); }
writeFileSync(join(ROOT, 'data/quotes.json'), JSON.stringify(next, null, 1) + '\n');
console.log(`${slug}: ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} written to data/quotes.json (${entries.map((e) => e.kind).join(', ')}), read on ${today}`);
console.log('now run: npm test');
