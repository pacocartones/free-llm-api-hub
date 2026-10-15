#!/usr/bin/env node
// npm run quotes:add -- <slug> [--passage-url "<passage>=<page address>"]...
//
// After you write the data_policy row of a provider (its quote, source and note), this reads the source page, in English, and writes the
// entries of that provider in data/quotes.json: the sentence, each phrase of the note between « », and the absence check if the note says
// something about the whole page. It writes the day, the hash and the method; you never type them. It changes nothing else.
// If something is not on the page it says what and writes nothing.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { quoteErrors } from './lib/quotes.mjs';
import { entriesFor, mergeRegistry, readText } from './lib/quotes-add.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--passage-url');
const passageUrls = {};
args.forEach((a, i) => { if (a === '--passage-url') { const v = args[i + 1] || ''; const at = v.lastIndexOf('='); if (at > 0) passageUrls[v.slice(0, at)] = v.slice(at + 1); } });
if (!slug) { console.error('usage: npm run quotes:add -- <slug> [--passage-url "<passage>=<address>"]'); process.exit(2); }

const data = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
const registry = JSON.parse(readFileSync(join(ROOT, 'data/quotes.json'), 'utf8'));
const p = data.providers.find((x) => x.slug === slug);
if (!p || !p.data_policy) { console.error(`${slug}: no provider with that slug has a data_policy in data/providers.json`); process.exit(2); }

const today = new Date().toISOString().slice(0, 10);
const { entries, problems } = await entriesFor(slug, p.data_policy, (u) => readText(u), { today, passageUrls });
if (problems.length) { console.error(problems.map((x) => `- ${x}`).join('\n')); console.error('nothing was written'); process.exit(1); }
const next = mergeRegistry(registry, data, slug, entries);
const errors = quoteErrors(data, next);
if (errors.length) { console.error(errors.map((x) => `- ${x}`).join('\n')); console.error('nothing was written'); process.exit(1); }
writeFileSync(join(ROOT, 'data/quotes.json'), JSON.stringify(next, null, 1) + '\n');
console.log(`${slug}: ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} written to data/quotes.json (${entries.map((e) => e.kind).join(', ')}), read on ${today}`);
console.log('now run: npm test');
