#!/usr/bin/env node
// A stdout-only editorial starting point, using the same events as changes.json.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readProviderRevisions, historyFromRevisions, HISTORY_FIELDS } from './lib/history.mjs';
import { latestOfficialDatasetTag, ORIGIN_TAGS } from './lib/release-tags.mjs';
import { flattenFieldChanges } from './lib/changes.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const markdown = (value) => JSON.stringify(value ?? null).replace(/[\\`*_{}[\]<>#|]/g, '\\$&');
export function changelogDraft(cwd = process.cwd()) {
  if (git(cwd, 'rev-parse', '--is-shallow-repository') !== 'false') throw new Error('Full git history required (fetch-depth: 0).');
  const tag = latestOfficialDatasetTag(cwd);
  const after = new Set(git(cwd, 'rev-list', `${ORIGIN_TAGS}${tag}..HEAD`).split('\n').filter(Boolean));
  const revisions = readProviderRevisions(cwd);
  const baseline = [...revisions].reverse().find(r => !after.has(r.hash));
  if (!baseline) throw new Error('No provider history at the starting tag.');
  const changes = revisions.filter(r => after.has(r.hash));
  const { historyBySlug } = historyFromRevisions([baseline, ...changes]);
  // Baseline additions are not changes since the tag, even on the same day.
  for (const p of baseline.parsed.providers || []) historyBySlug[p.slug]?.shift();
  const names = Object.fromEntries(revisions.flatMap(r => (r.parsed.providers || []).map(p => [p.slug, p.name])));
  const events = Object.values(historyBySlug).flat();
  const last = events.map(e => e.date).sort().at(-1) || `${baseline.date} (baseline; no changes since tag)`;
  const lines = ['# Changelog draft', '', `Since ${tag}; last observed change: ${last}.`, '',
    'Draft only: tracked fields from changes.json, plus additions. Review removals, schema changes, merged PR numbers and contributor credits manually; existing changelog credits must be preserved.', ''];
  const additions = Object.keys(historyBySlug).sort().filter(slug => historyBySlug[slug].some(e => e.kind === 'added'));
  if (additions.length) lines.push('## Added providers', '', ...additions.map(s => `- ${markdown(names[s] || s)} (${markdown(s)})`), '');
  const fields = flattenFieldChanges(historyBySlug, names);
  for (const field of Object.keys(HISTORY_FIELDS).sort()) {
    const rows = fields.filter(e => e.field === field).sort((a,b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    if (!rows.length) continue;
    lines.push(`## ${field}`, '');
    for (const e of rows) lines.push(`- ${markdown(e.name || e.slug)} (${markdown(e.slug)}), ${e.date}: ${markdown(e.from)} → ${markdown(e.to)}`);
    lines.push('');
  }
  if (!events.length) lines.push('No tracked provider changes since this tag.', '');
  return lines.join('\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(changelogDraft()); }
  catch (error) { console.error(`changelog-draft: ${error.message}`); process.exitCode = 1; }
}
