#!/usr/bin/env node
// monthly-issues.mjs — the two recurring contributor issues, run by .github/workflows/monthly-issues.yml on the 1st:
//   · "Free tier changes — <Month YYYY>": what changed in the dataset in the month that just ended (providers added
//     and removed, field changes), computed from the same git-mined history the build uses for /changes/ and the
//     monthly /state/ reports (lib/history.mjs, lib/changes.mjs), and an invitation to report what we missed.
//   · "New provider candidates — <Month YYYY>": an invitation to propose one provider per comment, under
//     docs/inclusion-criteria.md, with the current non-text share against the 35% guardrail.
// Preview by default; only --publish opens issues. Idempotent: an issue with the same title, open or closed, is never
// opened twice. It only reports: it never edits data, and the body holds our own data and URLs, never page text.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHistoryPlausible, mineHistoryAndSnapshots } from './lib/history.mjs';
import { flattenFieldChanges, formatValue } from './lib/changes.mjs';
import { monthLabel } from './lib/state.mjs';
import { plural } from './lib/text.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = 'pacocartones/free-llm-api-hub';
const REPO_URL = `https://github.com/${REPO}`;
const SITE = 'https://freellmapihub.com';
export const NON_TEXT_CAP = 0.35;
export const MAX_ROWS = 80;
const MAX_VALUE = 120;
const PROCESS_OPTIONS = { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 4 * 1024 * 1024 };

export const changesTitle = (month) => `Free tier changes — ${monthLabel(month)}`;
export const candidatesTitle = (month) => `New provider candidates — ${monthLabel(month)}`;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const assertMonth = (month) => { if (!MONTH.test(String(month))) throw new Error(`Invalid month "${month}"`); };

/** 'YYYY-MM' of a Date (UTC). */
export const monthOf = (now) => {
  if (!(now instanceof Date) || !Number.isFinite(+now)) throw new Error('Invalid clock');
  return now.toISOString().slice(0, 7);
};

/** The calendar month before `month` ('YYYY-MM'). */
export const previousMonth = (month) => {
  assertMonth(month);
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

/**
 * What changed in `month`: providers added and removed (month-end snapshot against the last snapshot before the
 * month) and the field changes dated in the month, oldest first. A month without a committed revision changed nothing.
 */
export function monthChanges({ month, historyBySlug, monthEnd, nameBySlug = {} }) {
  assertMonth(month);
  const after = monthEnd[month];
  const beforeKey = Object.keys(monthEnd).filter((k) => k < month).sort().pop();
  const before = beforeKey ? monthEnd[beforeKey].providers : [];
  if (!after) return { month, added: [], removed: [], fieldChanges: [] };
  const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.slug < b.slug ? -1 : 1);
  const slugsBefore = new Set(before.map((p) => p.slug));
  const slugsAfter = new Set(after.providers.map((p) => p.slug));
  const added = after.providers.filter((p) => !slugsBefore.has(p.slug)).map((p) => ({ slug: p.slug, name: p.name })).sort(byName);
  const removed = before.filter((p) => !slugsAfter.has(p.slug)).map((p) => ({ slug: p.slug, name: p.name })).sort(byName);
  const names = { ...Object.fromEntries([...before, ...after.providers].map((p) => [p.slug, p.name])), ...nameBySlug };
  const fieldChanges = flattenFieldChanges(historyBySlug, names)
    .filter((c) => c.date.startsWith(month + '-'))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)); // stable: name and field order inside a day kept
  return { month, added, removed, fieldChanges };
}

// One table cell: one line, no pipes, no @mentions, bounded length. The values are our own dataset strings.
export const cell = (v) => {
  const s = formatValue(v).replace(/\s+/g, ' ').trim();
  const short = s.length > MAX_VALUE ? `${s.slice(0, MAX_VALUE - 1)}…` : s;
  return short.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/@/g, '&#64;').replace(/</g, '&lt;') || '—';
};

const providerLink = (p, current) => (current.has(p.slug) ? `[${cell(p.name)}](${SITE}/p/${p.slug})` : cell(p.name));

/** The "Free tier changes" issue for a reported month. `current` is the set of slugs in today's dataset. */
export function changesIssue({ month, added, removed, fieldChanges }, { current = new Set(), sourceSha } = {}) {
  assertMonth(month);
  if (typeof sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error('Invalid source SHA');
  const label = monthLabel(month);
  const touched = new Set(fieldChanges.map((c) => c.slug));
  const out = [
    `What changed in the dataset in **${label}**, computed from the git history of [data/providers.json](${REPO_URL}/blob/${sourceSha}/data/providers.json) the same way as the [monthly report](${SITE}/state/${month}/) and the [What changed](${SITE}/changes/) page.`,
    '',
    `**${plural(added.length, 'provider', 'providers')} added, ${plural(removed.length, 'provider', 'providers')} removed, ${plural(fieldChanges.length, 'field change', 'field changes')} across ${plural(touched.size, 'provider', 'providers')}.**`,
    '',
    '## Added',
    '',
    ...(added.length ? added.map((p) => `- ${providerLink(p, current)} (\`${p.slug}\`)`) : ['_None._']),
    '',
    '## Removed',
    '',
    ...(removed.length ? removed.map((p) => `- ${cell(p.name)} (\`${p.slug}\`)`) : ['_None._']),
    '',
    '## Limit and flag changes',
    '',
  ];
  if (fieldChanges.length) {
    out.push('| Date | Provider | Field | From | To |', '|---|---|---|---|---|');
    for (const c of fieldChanges.slice(0, MAX_ROWS)) {
      out.push(`| ${c.date} | ${providerLink(c, current)} | ${cell(c.label)} | ${cell(c.from)} | ${cell(c.to)} |`);
    }
    if (fieldChanges.length > MAX_ROWS) out.push('', `_…and ${fieldChanges.length - MAX_ROWS} more: see the [monthly report](${SITE}/state/${month}/) or [api/v1/changes.json](${SITE}/api/v1/changes.json)._`);
    out.push('', '_Long values are shortened here; the full before and after are in [api/v1/changes.json](' + SITE + '/api/v1/changes.json)._');
  } else {
    out.push('_No field changes._');
  }
  out.push(
    '',
    '## Did we miss something?',
    '',
    `Providers change their free tiers quietly. If you noticed a change that is **not** listed above (a new limit, a removed free model, a card or phone requirement, a free tier that ended), comment here with:`,
    '',
    '- the provider,',
    '- what changed,',
    "- a link to the provider's **own** page that says so, and the UTC day you read it (`YYYY-MM-DD`).",
    '',
    `One change per comment is easiest to review. A comment is enough: you do not need to open a pull request. If you want to fix the data yourself, use the [outdated-entry form](${REPO_URL}/issues/new?template=inaccuracy.yml) or follow [CONTRIBUTING.md](${REPO_URL}/blob/main/CONTRIBUTING.md#for-provider-data-edit-the-source). Third-party posts are research leads, not sources.`,
    '',
    '_Opened automatically on the 1st of each month by `monthly-issues.yml`; it lists our own data and URLs only. A maintainer closes it when the reports have been handled._',
    '',
  );
  return { title: changesTitle(month), labels: ['data', 'help wanted', 'tracker'], body: out.join('\n') };
}

/** Non-text providers (no `text` modality), the share, and how many more fit under the cap. */
export function nonTextShare(providers, cap = NON_TEXT_CAP) {
  const total = providers.length;
  const nonText = providers.filter((p) => !(p.modalities || []).includes('text')).length;
  // Largest k with (nonText + k) / (total + k) <= cap.
  const room = Math.max(0, Math.floor((cap * total - nonText) / (1 - cap) + 1e-9));
  return { total, nonText, share: total ? nonText / total : 0, room };
}

const pct = (x) => `${(Math.round(x * 1000) / 10).toFixed(1)}%`;

/**
 * The "New provider candidates" issue for the month it is opened in. Labelled `help wanted` only: it is opened by a
 * schedule, not reviewed by a maintainer in the last 30 days, and adding a provider touches more than two files, so it
 * does not meet the `good first issue` criteria in CONTRIBUTING.md.
 */
export function candidatesIssue(month, providers) {
  assertMonth(month);
  const { total, nonText, share, room } = nonTextShare(providers);
  const capLine = room > 0
    ? `Today ${nonText} of ${total} providers (${pct(share)}) are non-text (no \`text\` modality: speech, image, embeddings, rerank, OCR). The guardrail is **35%**, so there is room for **${room}** more non-text ${room === 1 ? 'provider' : 'providers'} before text providers must come first.`
    : `Today ${nonText} of ${total} providers (${pct(share)}) are non-text (no \`text\` modality: speech, image, embeddings, rerank, OCR). The guardrail is **35%** and there is **no room** for another non-text provider right now: please propose **text** LLM APIs (a non-text proposal waits until text entries make room).`;
  const body = [
    `Know a free or trial LLM API we do not list yet? Propose **one provider per comment** this month.`,
    '',
    '## What qualifies',
    '',
    `Read [docs/inclusion-criteria.md](${REPO_URL}/blob/main/docs/inclusion-criteria.md) first. In short, all of these:`,
    '',
    '1. a programmatic API (not only a chat website or an IDE plugin);',
    '2. it runs LLMs or directly adjacent models (vision, embeddings, rerank, speech, image, OCR);',
    '3. genuine no-cost access today: a renewing free tier, a permanently free model or a trial credit;',
    "4. the offer is documented on the provider's **own** pricing or rate-limit page.",
    '',
    `Before proposing, check that it is not already on [the site](${SITE}/) and not in the README's [Notably NOT free](${REPO_URL}#notably-not-free) section.`,
    '',
    '## The 35% non-text guardrail',
    '',
    capLine,
    '',
    '## How to propose',
    '',
    'Comment here with:',
    '',
    '- the provider name and its API docs link,',
    "- the provider's own page that states the free tier or trial credit, quoting the sentence, and the UTC day you read it (`YYYY-MM-DD`),",
    '- the catch, if you saw one (card or phone required, evaluation only, region locks).',
    '',
    `Or open the [new provider form](${REPO_URL}/issues/new?template=new-provider.yml) for a full proposal. If you want to add it yourself, \`npm run add-provider -- <slug> "<Name>"\` drafts the entry ([CONTRIBUTING.md](${REPO_URL}/blob/main/CONTRIBUTING.md#for-provider-data-edit-the-source)); say so in your comment so nobody duplicates the work.`,
    '',
    'Third-party lists and posts are fine for *finding* a provider, but the evidence must be the provider\'s own page. Providers cannot buy a spot: inclusion follows the criteria only.',
    '',
    '_Opened automatically on the 1st of each month by `monthly-issues.yml`. A maintainer closes it at the end of the month; proposals that were not handled can be repeated in the next one._',
    '',
  ].join('\n');
  return { title: candidatesTitle(month), labels: ['data', 'help wanted', 'tracker'], body };
}

/** Opens the issue unless one with the same title exists in any state. Returns the existing or new issue number. */
export function publishIssue({ title, labels, body }, runGh) {
  const found = JSON.parse(runGh(['issue', 'list', '--repo', REPO, '--state', 'all', '--limit', '100', '--search', `in:title "${title}"`, '--json', 'number,title,state']));
  if (!Array.isArray(found)) throw new Error('Unexpected issue list response');
  const same = found.find((i) => i && i.title === title);
  if (same) return { created: false, number: same.number };
  const args = ['issue', 'create', '--repo', REPO, '--title', title, '--body-file', '-'];
  for (const l of labels) args.push('--label', l);
  const url = runGh(args, body).trim();
  const m = url.match(/\/issues\/(\d+)\s*$/);
  if (!m) throw new Error('Issue create returned no issue URL');
  return { created: true, number: Number(m[1]) };
}

/** Both issues for a run on `now`: changes of the month before, candidates for the current month. */
export function monthlyIssues({ now, providers, historyBySlug, monthEnd, sourceSha }) {
  const month = monthOf(now);
  const reported = previousMonth(month);
  const nameBySlug = Object.fromEntries(providers.map((p) => [p.slug, p.name]));
  const current = new Set(providers.map((p) => p.slug));
  return [
    changesIssue(monthChanges({ month: reported, historyBySlug, monthEnd, nameBySlug }), { current, sourceSha }),
    candidatesIssue(month, providers),
  ];
}

function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--publish')) {
    console.error('Unknown argument; only --publish is supported.');
    process.exitCode = 1;
    return;
  }
  const { providers } = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  const { historyBySlug, monthEnd } = mineHistoryAndSnapshots({ cwd: ROOT });
  // A shallow clone or a missing git would report "nothing changed": refuse instead of publishing that.
  assertHistoryPlausible(historyBySlug);
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { ...PROCESS_OPTIONS, cwd: ROOT }).trim();
  const issues = monthlyIssues({ now: new Date(), providers, historyBySlug, monthEnd, sourceSha });
  if (!args.includes('--publish')) {
    for (const i of issues) process.stdout.write(`# ${i.title}\nLabels: ${i.labels.join(', ')}\n\n${i.body}\n`);
    return;
  }
  const runGh = (ghArgs, input) => execFileSync('gh', ghArgs, { ...PROCESS_OPTIONS, input });
  for (const i of issues) {
    const r = publishIssue(i, runGh);
    console.log(r.created ? `Opened #${r.number}: ${i.title}` : `Skipped, #${r.number} already exists: ${i.title}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (e) {
    // Do not print child-process errors: they may include credentials or response bodies.
    console.error(e && /^(Invalid|Unexpected|Issue create|expected|every|groq)/.test(e.message) ? `Monthly issues failed: ${e.message}` : 'Monthly issues failed. Check git history (full clone), labels and access to issues.');
    process.exitCode = 1;
  }
}
