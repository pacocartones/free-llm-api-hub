// Minimal real tests over the build pipeline (node --test, zero dependencies).
// Covers: serializer round-trip, validator honesty rules, existing self-tests,
// build idempotency, and one generated README row matching the data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { roundTripError } from './_serialize.mjs';
import { freshnessBadge, freshnessColor, freshnessStatus, recScore, SLA_DAYS, DUE_SOON_DAYS } from './lib/rules.mjs';
import { esc, stripTags } from './lib/escape.mjs';
import { mineProviderHistory, assertHistoryPlausible } from './lib/history.mjs';
import { countExternalContributors, countExternalContributorsFromLog } from './lib/contributors.mjs';
import { buildOgManifest } from './lib/og.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data/providers.json');
const run = (args) => execFileSync(process.execPath, args, { cwd: ROOT, stdio: 'pipe' });
const exitOk = (args) => {
  try {
    run(args);
    return true;
  } catch {
    return false;
  }
};

test('serializer round-trips data/providers.json byte-exactly', () => {
  assert.equal(roundTripError(readFileSync(DATA, 'utf8')), null);
});

test('validate passes on the real dataset', () => {
  run(['scripts/validate.mjs']); // throws unless exit 0
});

test('validate rejects a verified entry with no last_verified date', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  data.providers[0].verified = true;
  data.providers[0].last_verified = null;
  const fixture = join(mkdtempSync(join(tmpdir(), 'flah-')), 'providers.json');
  writeFileSync(fixture, JSON.stringify(data));
  assert.equal(exitOk(['scripts/validate.mjs', fixture]), false);
});

test('validate rejects an unverified entry that still carries a date', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  data.providers[0].verified = false;
  data.providers[0].last_verified = '2026-01-01';
  const fixture = join(mkdtempSync(join(tmpdir(), 'flah-')), 'providers.json');
  writeFileSync(fixture, JSON.stringify(data));
  assert.equal(exitOk(['scripts/validate.mjs', fixture]), false);
});

test('validate accepts a credential-only probe result', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  data.providers[0].last_probed = '2026-08-03';
  data.providers[0].probe_status = 'auth-ok';
  const fixture = join(mkdtempSync(join(tmpdir(), 'flah-')), 'providers.json');
  writeFileSync(fixture, JSON.stringify(data));
  assert.equal(exitOk(['scripts/validate.mjs', fixture]), true);
});

test('validate rejects a probe report that references a removed provider', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  const fixture = join(mkdtempSync(join(tmpdir(), 'flah-')), 'providers.json');
  writeFileSync(fixture, JSON.stringify(data));
  // github-models was retired from the dataset on 2026-08-02; a report that
  // still lists it must fail (this is the exact nine-day drift that hid until
  // 2026-08-11).
  const report = JSON.parse(readFileSync(join(ROOT, 'data/probe-report.json'), 'utf8'));
  report.results.push({ slug: 'github-models', env_key: 'GITHUB_TOKEN', key_present: false, status: 'skipped-no-key' });
  report.count = report.results.length;
  const reportFixture = join(mkdtempSync(join(tmpdir(), 'flah-')), 'probe-report.json');
  writeFileSync(reportFixture, JSON.stringify(report));
  assert.equal(exitOk(['scripts/validate.mjs', fixture, reportFixture]), false);
});

test('existing script self-tests pass (fetch-models, probe)', () => {
  run(['scripts/fetch-models.mjs', '--self-test']);
  run(['scripts/probe.mjs', '--self-test']);
});

const GENERATED = [
  'README.md',
  'badge-freshness.json',
  'data/providers.csv',
  'data/providers.yaml',
  'site/index.html',
];
const hashAll = () =>
  GENERATED.map((f) => createHash('sha256').update(readFileSync(join(ROOT, f))).digest('hex')).join('|');

test('build is idempotent — a second run changes not a single byte', () => {
  run(['scripts/build.mjs']);
  const first = hashAll();
  run(['scripts/build.mjs']);
  assert.equal(hashAll(), first);
});

// ---------- the git-mined provider history must be alive ----------
// A silent regression in the history miner (e.g. the Buffer-vs-utf8-string
// misalignment that was fixed alongside the git cat-file --batch change)
// produces an empty history object — no provider pages would show a change
// log, and `site/api/v1/history.json` would be nearly empty. Catch it.
test('the git-mined provider history is not empty and events are plausible', () => {
  // Standalone-friendly: in the normal suite the idempotency test above has
  // already run build.mjs, so history.json is fresh on disk. If this test runs
  // in isolation (e.g. --test-name-pattern on a tree with no build artifacts)
  // and the file is missing, run the build ourselves instead of depending on
  // that declaration order.
  const p = join(ROOT, 'site/api/v1/history.json');
  if (!existsSync(p)) run(['scripts/build.mjs']);
  assert.ok(existsSync(p), 'history.json should exist on disk after build');
  const payload = JSON.parse(readFileSync(p, 'utf8'));
  assert.ok(payload.history && typeof payload.history === 'object', 'history.json should carry a history object');
  // Same invariants as scripts/check-history.mjs and the direct-miner test
  // below — one shared source of truth in lib/history.mjs. These were inline
  // here once; keeping them inline let them drift from the CI check.
  assertHistoryPlausible(payload.history);
});

test('the git-mined history miner is plausible directly (no build needed)', () => {
  // Same invariants as the CI step scripts/check-history.mjs, exercised from
  // the test suite without waiting for build.mjs to run (and without depending
  // on the idempotency test above having generated history.json).
  const history = mineProviderHistory({ cwd: ROOT });
  assertHistoryPlausible(history);
});

test('external contributor count excludes maintainer and bots, dedupes by email', () => {
  const log = [
    'pacocartones\x1f253313177+pacocartones@users.noreply.github.com', // maintainer (noreply)
    'pacocartones\x1fmanusanchezhl@gmail.com', // maintainer (personal email)
    'github-actions[bot]\x1fgithub-actions[bot]@users.noreply.github.com', // bot
    'dependabot[bot]\x1f49699333+dependabot[bot]@users.noreply.github.com', // bot
    'coderabbitai[bot]\x1fcoderabbitai[bot]@users.noreply.github.com', // bot
    'Jhansi Oruganti\x1fjhansi@example.com', // external, twice → one contributor
    'Jhansi Oruganti\x1fjhansi@example.com',
    'Another Dev\x1fanother@example.com', // external
    '', // trailing newline from git output
  ].join('\n');
  assert.equal(countExternalContributorsFromLog(log), 2);
});

test('external contributor count tolerates empty and malformed history', () => {
  assert.equal(countExternalContributorsFromLog(''), 0);
  assert.equal(countExternalContributorsFromLog('\n'), 0);
  assert.equal(countExternalContributorsFromLog('line without separator'), 0);
  assert.equal(countExternalContributorsFromLog('Only Name\x1f'), 0); // empty email
  assert.equal(countExternalContributorsFromLog('\x1fonly@email.com'), 0); // empty name
});

test('the README stats line reports the real external contributor count, stably', () => {
  const once = countExternalContributors({ cwd: ROOT });
  const twice = countExternalContributors({ cwd: ROOT });
  assert.equal(once, twice, 'the count is stable across calls on the same checkout');
  assert.ok(once >= 1, 'this repo has at least one external contributor (JhansiOruganti-43 via #27)');
  const span = readFileSync(join(ROOT, 'README.md'), 'utf8')
    .match(/<!-- AUTOGEN:stats:start -->\s*([\s\S]*?)\s*<!-- AUTOGEN:stats:end -->/)?.[1];
  assert.ok(span, 'README should carry an AUTOGEN stats span');
  assert.match(span, new RegExp(`\\*\\*${once}\\*\\* external contributor${once === 1 ? '' : 's'}\\s*$`));
});

test('the committed OG manifest matches the current dataset', () => {
  // The CI step scripts/check-og.mjs blocks stale OG images; this pins the
  // same invariant in the local suite: site/og/manifest.json (written by
  // `npm run og`) must equal the fingerprints recomputed from the data.
  const { providers } = JSON.parse(readFileSync(DATA, 'utf8'));
  const manifest = JSON.parse(readFileSync(join(ROOT, 'site/og/manifest.json'), 'utf8'));
  assert.deepEqual(manifest, buildOgManifest(providers));
});

test('a generated README row matches the data it was built from', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  const p = data.providers.find((x) => x.slug === 'groq');
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.ok(readme.includes(`[${p.name}](${p.docs_url})`), 'README links the provider docs');
  assert.ok(readme.includes(`✅ ${p.last_verified}`), 'README shows the verification date');
});

test('the explorer does not claim a column sort before the user chooses one', () => {
  const explorer = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  assert.match(explorer, /<th data-key="name" tabindex="0" role="button" aria-sort="none">API<\/th>/);
});

// ---------- output sanitizers (CodeQL js/incomplete-sanitization + multi-char) ----------

test('esc handles null and undefined gracefully', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
});

test('esc does not double-escape an already-escaped backslash', () => {
  // Backslash is escaped FIRST so subsequent passes never double up.
  const once = esc('a\\b');
  assert.equal(once, 'a\\\\b');
  assert.equal(esc(once), 'a\\\\\\\\b'); // second pass → 4 backslashes (correct)
});

test('esc escapes angle brackets to HTML entities', () => {
  assert.equal(esc('<x>'), '&lt;x&gt;');
  assert.equal(esc('a < b && c > d'), 'a &lt; b && c &gt; d');
});

test('esc escapes pipe and markdown link brackets with backslash', () => {
  assert.equal(esc('a|b'), 'a\\|b');        // backslash + pipe so GFM cell is safe
  assert.equal(esc('[link](url)'), '\\[link\\](url)');
});

test('esc is safe when fields contain a mix of all special chars', () => {
  const out = esc('check|<a>link[ref]');
  assert.equal(out, 'check\\|&lt;a&gt;link\\[ref\\]');
});

test('esc replaces newlines with a space and trims', () => {
  assert.equal(esc('\nhello\nworld\n'), 'hello world');
  assert.equal(esc('\r\nwindows\r\n'), 'windows');
});

test('stripTags removes a normal HTML tag', () => {
  assert.equal(stripTags('hello <b>world</b>'), 'hello world');
});

test('stripTags removes nested fragments with fixed-point iteration', () => {
  // A single pass of /<[^>]*>/ leaves <<script>LANG> as <LANG> — not stripped.
  // The fixed-point loop catches it on the second pass; a trailing `>` that
  // was never opened survives (stripTags removes tag pairs, not stray angles).
  assert.equal(stripTags('<<script>alert(1)<</script>>'), 'alert(1)>');
  // Nested tags collapse in one match; the orphan `>` survives.
  assert.equal(stripTags('<scr<script>ipt>'), 'ipt>');
});

test('stripTags passes clean text through unchanged', () => {
  // stripTags is aggressive on purpose: bare < and > ARE treated as tag
  // boundaries. In the build pipeline text reaches stripTags already escaped
  // by htmlEsc/esc, so this is only reached with clean payloads or
  // pre-stripped fragments.
  assert.equal(stripTags('no tags here'), 'no tags here');
  assert.equal(stripTags('&lt; &amp; &gt;'), '&lt; &amp; &gt;');
});

// ---------- the freshness badge has to be able to go amber and red ----------
// The previous badge was graded on the share of entries inside the 90-day SLA.
// With the list re-verified in sweeps it could not leave brightgreen without
// months of silence, so it never reported anything. These cases pin the three
// states to fabricated dates: if someone re-grades the badge on a number that
// cannot decay, one of them fails.
const NOW = new Date('2026-08-07T00:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 10);
const entries = (...ages) => ages.map((a) => ({ verified: true, last_verified: daysAgo(a) }));

test('badge is brightgreen while every entry is inside the due-soon window', () => {
  const { badge, oldest } = freshnessBadge(entries(4, 8, DUE_SOON_DAYS), NOW);
  assert.equal(oldest, DUE_SOON_DAYS);
  assert.equal(badge.color, 'brightgreen');
  assert.equal(badge.message, `3/3 verified · oldest ${DUE_SOON_DAYS}d`);
});

test('badge turns yellow as soon as one entry is due for re-verification', () => {
  const { badge } = freshnessBadge(entries(4, 8, DUE_SOON_DAYS + 1), NOW);
  assert.equal(badge.color, 'yellow');
  assert.match(badge.message, new RegExp(`oldest ${DUE_SOON_DAYS + 1}d$`));
});

test('badge turns red as soon as one entry breaches the SLA', () => {
  const { badge } = freshnessBadge(entries(4, 8, SLA_DAYS + 1), NOW);
  assert.equal(badge.color, 'red');
  assert.match(badge.message, new RegExp(`oldest ${SLA_DAYS + 1}d$`));
});

test('badge decays on its own: the same data goes green → yellow → red as time passes', () => {
  const data = entries(0, 10, 27); // roughly today's real spread
  const at = (d) => freshnessBadge(data, new Date(NOW.getTime() + d * 86400000)).badge.color;
  assert.equal(at(0), 'brightgreen');
  assert.equal(at(40), 'yellow'); // oldest is now 67d — nothing was re-verified
  assert.equal(at(70), 'red'); // oldest is now 97d — SLA breached
});

test('badge cannot be brightgreen when most rows were never verified', () => {
  const half = [...entries(1, 1), { verified: false, last_verified: null }, { verified: false, last_verified: null }];
  const { badge, coverage } = freshnessBadge(half, NOW);
  assert.equal(coverage, 0.5);
  assert.equal(badge.color, 'yellow');
  assert.equal(badge.message, '2/4 verified · oldest 1d');
});

test('badge is red with nothing verified at all', () => {
  const { badge } = freshnessBadge([{ verified: false, last_verified: null }], NOW);
  assert.equal(badge.color, 'red');
  assert.equal(badge.message, '0/1 verified');
});

// The worklist and the badge must bucket an entry identically at every age — the
// 60-day "due soon" threshold was once `>= 60` in one place and `> 60` in the
// other, so an entry exactly 60 days old was "due soon" to the worklist but
// brightgreen on the badge. Both now grade on freshnessStatus (rules.mjs).
test('badge and worklist bucket identically at the 60-day threshold', () => {
  assert.equal(freshnessStatus(59), 'fresh');
  assert.equal(freshnessStatus(60), 'fresh');
  assert.equal(freshnessStatus(61), 'due');
  assert.equal(freshnessStatus(90), 'due');
  assert.equal(freshnessStatus(91), 'stale');
  assert.equal(freshnessStatus(null), 'due');
  assert.equal(freshnessColor(60), 'brightgreen');
  assert.equal(freshnessColor(61), 'yellow');
  assert.equal(freshnessColor(91), 'red');
  assert.equal(freshnessColor(null), 'yellow');
});

// Deliberately not compared against a freshly built badge: the committed file
// ages a day at a time between build passes, and this suite is a
// blocking check on every pull request. What must always hold is that the file
// is internally consistent — the colour is the one the rule gives to the age the
// message itself states — which catches a hand-edited or half-migrated badge
// without turning the clock into a source of red builds.
test('the shipped badge grades its own stated age by the rule', () => {
  const onDisk = JSON.parse(readFileSync(join(ROOT, 'badge-freshness.json'), 'utf8'));
  assert.equal(onDisk.schemaVersion, 1);
  assert.equal(onDisk.label, 'freshness');
  const m = onDisk.message.match(/^(\d+)\/(\d+) verified · oldest (\d+)d$/);
  assert.ok(m, `unexpected badge message: ${onDisk.message}`);
  const [, verified, total, oldest] = m.map(Number);
  const expected = freshnessColor(Number(oldest));
  assert.equal(onDisk.color, expected === 'brightgreen' && verified / total < 0.7 ? 'yellow' : expected);
});

// ---------- a confirmed "yes" must never look like an unknown ----------
test('the README shows a card wall for every provider confirmed to have one', () => {
  const { providers } = JSON.parse(readFileSync(DATA, 'utf8'));
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const walled = providers.filter((p) => p.card_required === true);
  assert.ok(walled.length, 'dataset has at least one card-gated provider to check');
  for (const p of walled) {
    const row = readme.split('\n').find((l) => l.includes(`](${p.docs_url})`));
    assert.ok(row, `${p.slug}: no README row found`);
    assert.match(row, /💳 card required/, `${p.slug}: README row hides the card requirement`);
  }
});

test('an unconfirmed flag ranks between a confirmed yes and a confirmed no', () => {
  const base = { category: 'ongoing', free_type: 'perpetual' };
  const no = recScore({ ...base, card_required: false });
  const unknown = recScore({ ...base, card_required: null });
  const yes = recScore({ ...base, card_required: true });
  assert.ok(no > unknown && unknown > yes, `expected ${no} > ${unknown} > ${yes}`);
});

// ---------- CI workflows must not run `gh pr view` (no bot logic) ----------
// The regenerate bot is gone (2026-08): nothing in CI may decide to create,
// skip or filter PRs — all maintenance is local. If a workflow ever runs
// `gh pr view` again it is probably bot logic sneaking back in.
test('no workflow runs `gh pr view` (bot logic is banned from CI)', () => {
  const dir = join(ROOT, '.github/workflows');
  const files = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  assert.ok(files.length > 0, `no workflow files found in ${dir}`);
  const offenders = [];
  for (const file of files) {
    const source = readFileSync(join(dir, file), 'utf8');
    source.split('\n').forEach((raw, i) => {
      const code = raw.trim().replace(/^#.*$/, '');
      if (/gh pr view\s/.test(code)) offenders.push(`${file}:${i + 1}: 'gh pr view' is bot logic — not allowed in CI`);
    });
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});
