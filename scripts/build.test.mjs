// Minimal real tests over the build pipeline (node --test).
// Covers: serializer round-trip, validator honesty rules, existing self-tests,
// build idempotency, one generated README row matching the data, and the
// generated client configs (LiteLLM + OpenAI SDK) and published JSON Schema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { ORDER, roundTripError } from './_serialize.mjs';
import { freshnessBadge, freshnessColor, freshnessStatus, recScore, SLA_DAYS, DUE_SOON_DAYS } from './lib/rules.mjs';
import { esc, stripTags } from './lib/escape.mjs';
import { mineProviderHistory, assertHistoryPlausible } from './lib/history.mjs';
import { countExternalContributorsFromLog } from './lib/contributors.mjs';
import { buildOgManifest } from './lib/og.mjs';
import { explorerRowHtml } from './lib/rows.mjs';
import { clientConfigProviders, openaiClients, litellmYaml, MODEL_PLACEHOLDER } from './lib/client-config.mjs';

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

test('serializer ORDER matches the JSON Schema provider properties', () => {
  const schema = JSON.parse(readFileSync(join(ROOT, 'data/schema.json'), 'utf8'));
  const providerKeys = Object.keys(schema.$defs.provider.properties);

  assert.deepEqual(
    [...ORDER].sort(),
    providerKeys.sort(),
    'serializer ORDER and provider schema properties must stay in sync',
  );
});

test('validate passes on the real dataset', () => {
  run(['scripts/validate.mjs']); // throws unless exit 0
});

test('validate rejects properties outside the JSON Schema with their exact path', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  data.providers[0].schema_only_typo = true;
  const fixture = join(mkdtempSync(join(tmpdir(), 'flah-')), 'providers.json');
  writeFileSync(fixture, JSON.stringify(data));

  let validationError;
  try {
    run(['scripts/validate.mjs', fixture]);
  } catch (error) {
    validationError = error;
  }

  assert.ok(validationError, 'an undeclared provider property must fail validation');
  assert.equal(validationError.status, 1);
  assert.match(validationError.stderr.toString('utf8'), /\/providers\/0\/schema_only_typo/);
});

test('validate reports missing schema-required properties with their exact path', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  delete data.providers[0].name;
  const fixture = join(mkdtempSync(join(tmpdir(), 'flah-')), 'providers.json');
  writeFileSync(fixture, JSON.stringify(data));

  let validationError;
  try {
    run(['scripts/validate.mjs', fixture]);
  } catch (error) {
    validationError = error;
  }

  assert.ok(validationError, 'a missing required property must fail validation');
  assert.equal(validationError.status, 1);
  assert.match(validationError.stderr.toString('utf8'), /\/providers\/0\/name/);
});

test('validate enforces JSON Schema formats with their exact path', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  data.source = 'not a URI';
  const fixture = join(mkdtempSync(join(tmpdir(), 'flah-')), 'providers.json');
  writeFileSync(fixture, JSON.stringify(data));

  let validationError;
  try {
    run(['scripts/validate.mjs', fixture]);
  } catch (error) {
    validationError = error;
  }

  assert.ok(validationError, 'an invalid schema format must fail validation');
  assert.equal(validationError.status, 1);
  assert.match(validationError.stderr.toString('utf8'), /\/source/);
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

test('validate rejects a generated date older than the newest verification', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  const newest = data.providers
    .map((p) => [p.last_verified, p.added])
    .flat()
    .filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .pop();
  assert.ok(newest, 'fixture needs at least one dated entry to be meaningful');
  data.generated = '2000-01-01'; // older than every real date in the dataset
  const fixture = join(mkdtempSync(join(tmpdir(), 'flah-')), 'providers.json');
  writeFileSync(fixture, JSON.stringify(data));
  assert.equal(exitOk(['scripts/validate.mjs', fixture]), false);
});

// Audit A5: comparison-dimensions.md claims the tri-state null gaps "against
// the dataset", and methodology.md describes the freshness badge's buckets. Both
// are prose in hand-written docs, so nothing stopped them drifting from the data
// (they did: commercial 36→35, card 23→22 after #117) or the rules. These two
// tests make the claims self-pinning: a data PR that resolves a null must update
// the doc line, and a threshold change must update the description.
test('comparison-dimensions.md reports the real tri-state null gaps', () => {
  const { providers } = JSON.parse(readFileSync(DATA, 'utf8'));
  const total = providers.length;
  const nullCount = (f) => providers.filter((p) => p[f] === null).length;
  const expected = `Current gaps: \`phone_required\` ${nullCount('phone_required')}/${total}, \`commercial_ok\` ${nullCount('commercial_ok')}/${total}, \`card_required\` ${nullCount('card_required')}/${total}.`;
  const doc = readFileSync(join(ROOT, 'docs/comparison-dimensions.md'), 'utf8');
  assert.ok(doc.includes(expected), `gap counts drifted:\n  doc says:     ${doc.match(/Current gaps:[^\n]*/)?.[0]}\n  data expects: ${expected}`);
});

test('the freshness badge is described with the real thresholds and grading', () => {
  const methodology = readFileSync(join(ROOT, 'docs/methodology.md'), 'utf8');
  const bullet = methodology.match(/The freshness badge is computed[^\n]*/)?.[0];
  assert.ok(bullet, 'methodology.md should describe the freshness badge');
  assert.ok(bullet.includes('oldest'), 'the description must say the badge grades the OLDEST entry');
  assert.ok(bullet.includes(String(DUE_SOON_DAYS)), `the description must state the due-soon threshold (${DUE_SOON_DAYS})`);
  assert.ok(bullet.includes(String(SLA_DAYS)), `the description must state the SLA (${SLA_DAYS})`);
});

// Audit A2: the widget used to embed its own copy of recScore, which drifted —
// the card_required/phone_required true-penalties went missing, so a provider
// with a required card/phone ranked HIGHER in the widget than in the explorer.
// It must use the shared FLLM_RULES.recScore (generated from rules.mjs) and
// keep no local scoring copy: tri-state arithmetic lives only in rules.mjs.
test('the widget ranks with the shared recScore, not its own copy', () => {
  const widget = readFileSync(join(ROOT, 'site/widget.js'), 'utf8');
  assert.match(widget, /FLLM_RULES\.recScore/, 'widget must use the shared recScore');
  assert.doesNotMatch(widget, /card_required\s*===/, 'widget must not re-implement flag scoring');
  assert.doesNotMatch(widget, /phone_required\s*===/, 'widget must not re-implement flag scoring');
  assert.doesNotMatch(widget, /commercial_ok\s*===/, 'widget must not re-implement flag scoring');
  assert.doesNotMatch(widget, /free_type\s*===/, 'widget must not re-implement flag scoring');
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

test('the public surface omits retired exports and home redundancies, while updates stay paginated', () => {
  run(['scripts/build.mjs']);

  const index = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  assert.doesNotMatch(index, /Recently re-verified/);
  assert.doesNotMatch(index, /providers[.]csv|providers[.]yaml|CSV export|YAML export|JSON Schema/);
  assert.doesNotMatch(readFileSync(join(ROOT, 'site/explorer.js'), 'utf8'), /Could not load providers[.]json[.]/);
  for (const rel of ['data/providers.csv', 'data/providers.yaml', 'site/providers.csv', 'site/providers.yaml']) {
    assert.equal(existsSync(join(ROOT, rel)), false, `${rel} must not survive the retired export feature`);
  }

  const best = readFileSync(join(ROOT, 'site/best/index.html'), 'utf8');
  assert.match(best, /<section class="page-hero model-hero">/);
  assert.doesNotMatch(best, /best-wrap/);
  assert.match(best, /<a class="star-btn" href="https:\/\/github[.]com\/pacocartones\/free-llm-api-hub"/);

  const updates = readFileSync(join(ROOT, 'site/updates.html'), 'utf8');
  assert.ok((updates.match(/<li class="upd">/g) || []).length <= 20, 'the first updates page has at most 20 entries');
  assert.match(updates, /Page 1 of \d+/);
  const secondUpdatesPage = join(ROOT, 'site/updates/page/2/index.html');
  assert.equal(existsSync(secondUpdatesPage), true, 'the second page must be emitted when history exceeds 20 entries');
  assert.match(readFileSync(secondUpdatesPage, 'utf8'), /Page 2 of \d+/);
});

// ---------- footer structure (the two-places rule) ----------
// The home footer is hand-written in site/index.html; every other page gets the
// siteFooter() copy in build.mjs. One stray </div> after the brand block closed
// .wrap.footer-top early, so the three link columns escaped the grid AND the
// .wrap width on every generated page while the home page stayed correct. Pin
// the shape on both copies so the two can never drift apart silently again.
test('every page nests the footer columns inside .wrap.footer-top', () => {
  run(['scripts/build.mjs']);

  const pages = [
    'site/index.html',                          // hand-written home
    'site/p/groq.html',                         // provider page
    'site/guides/free-embeddings-apis.html',    // guide
    'site/collections/no-phone.html',           // collection
    'site/best/index.html',                     // directory-index page
    'site/updates.html',                        // root-prefix page
    'site/legal/privacy.html',
  ];

  for (const rel of pages) {
    const html = readFileSync(join(ROOT, rel), 'utf8');
    const footer = html.slice(html.indexOf('<footer class="site-footer"'), html.indexOf('</footer>'));
    assert.ok(footer, `${rel} must render the site footer`);

    const opens = (footer.match(/<div\b/g) || []).length;
    const closes = (footer.match(/<\/div>/g) || []).length;
    assert.equal(closes, opens, `${rel}: unbalanced <div> in the footer (${opens} open, ${closes} close)`);

    const top = footer.slice(footer.indexOf('<div class="wrap footer-top">'), footer.indexOf('<div class="wrap footer-bottom">'));
    assert.equal((top.match(/<div class="footer-brand">/g) || []).length, 1, `${rel}: the brand block must sit in footer-top`);
    assert.equal((top.match(/<div class="footer-col">/g) || []).length, 3, `${rel}: all three link columns must sit in footer-top`);
  }
});

test('derived-fingerprints.json pins gitignored outputs, skips site/p/, site/badges/, tracked and git-log files', () => {
  const fp = join(ROOT, 'derived-fingerprints.json');
  if (!existsSync(fp)) run(['scripts/build.mjs']);
  const pins = JSON.parse(readFileSync(fp, 'utf8'));
  for (const rel of ['site/models/index.html', 'site/api/v1/providers.json',
                     'site/llms.txt', 'site/shared-rules.js']) {
    assert.ok(pins[rel] && /^[0-9a-f]{64}$/.test(pins[rel]), rel + ' should be pinned with a sha256');
  }
  for (const rel of ['site/updates.html', 'site/feed.xml', 'site/api/v1/history.json']) {
    assert.equal(pins[rel], undefined, rel + ' must not be pinned (git-log-derived)');
  }
  assert.equal(Object.keys(pins).some((k) => k.startsWith('site/p/')), false,
    'site/p/ must not be pinned (date-relative)');
  assert.equal(Object.keys(pins).some((k) => k.startsWith('site/badges/')), false,
    'site/badges/ must not be pinned (colour tracks verification age)');
  assert.equal(Object.keys(pins).some((k) => k.startsWith('site/og/')), false,
    'site/og/ is tracked and diff-gated directly');
  assert.equal(pins['site/index.html'], undefined,
    'tracked regenerated files are gated by git diff, not the fingerprint');
});

// site/badges/ is outside the fingerprint (its colour tracks verification age),
// so check the files directly: one shields.io endpoint per provider, no strays,
// and a message that states the verification date the dataset records.
test('per-provider badges exist for every provider and match the dataset', () => {
  const dir = join(ROOT, 'site/badges');
  if (!existsSync(dir)) run(['scripts/build.mjs']);
  const { providers } = JSON.parse(readFileSync(DATA, 'utf8'));
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  assert.deepEqual(files, providers.map((p) => p.slug + '.json').sort(), 'one badge per provider, no strays');
  for (const p of providers) {
    const b = JSON.parse(readFileSync(join(dir, p.slug + '.json'), 'utf8'));
    assert.equal(b.schemaVersion, 1, p.slug);
    assert.equal(b.label, 'free-llm-api-hub', p.slug);
    assert.equal(b.message, p.verified ? 'verified ' + p.last_verified : 'unverified', p.slug);
    assert.ok(['brightgreen', 'yellow', 'red'].includes(b.color), p.slug + ': unexpected colour ' + b.color);
  }
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

test('the README Contributors section lists every contributor in data/contributors.json', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const people = JSON.parse(readFileSync(join(ROOT, 'data/contributors.json'), 'utf8')).contributors || [];
  assert.ok(people.length >= 4, 'expected at least the four known external contributors, got ' + people.length);
  for (const p of people) assert.ok(readme.includes(p.name), p.name + ' should be listed in the README Contributors section');
});
test('the README shows a live contributors badge, not a computed number', () => {
  // The contributor count used to be computed into the generated stats line and
  // could go stale between build passes (it did: 2 while the real count was 3).
  // It is now a shields.io badge that GitHub resolves live on every view.
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /img\.shields\.io\/github\/contributors\/pacocartones\/free-llm-api-hub/);
  assert.doesNotMatch(readme, /independently verified against the provider's own docs/, 'no computed stats line in the README header');
});

test('the committed OG manifest matches the current dataset', () => {
  // The CI step scripts/check-og.mjs blocks stale OG images; this pins the
  // same invariant in the local suite: site/og/manifest.json (written by
  // `npm run og`) must equal the fingerprints recomputed from the data.
  const { providers } = JSON.parse(readFileSync(DATA, 'utf8'));
  const manifest = JSON.parse(readFileSync(join(ROOT, 'site/og/manifest.json'), 'utf8'));
  assert.deepEqual(manifest, buildOgManifest(providers));
});

test('the README top-20 table renders every editorial pick with its verified date', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  const best = JSON.parse(readFileSync(join(ROOT, 'data/best.json'), 'utf8'));
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const bySlug = new Map(data.providers.map((x) => [x.slug, x]));
  assert.equal(best.entries.length, 20, 'README is the editorial top 20, not the full list');
  for (const e of best.entries) {
    const p = bySlug.get(e.slug);
    assert.ok(p, `${e.slug} is not in the dataset`);
    assert.ok(readme.includes(`[${p.name}](${p.docs_url})`), `${e.slug}: README links the provider docs`);
    assert.ok(readme.includes(`✅ ${p.last_verified}`), `${e.slug}: README shows the verification date`);
  }
});

test('/api/v1/best.json exposes the editorial top 20 with full profiles', () => {
  const p = join(ROOT, 'site/api/v1/best.json');
  if (!existsSync(p)) run(['scripts/build.mjs']);
  const payload = JSON.parse(readFileSync(p, 'utf8'));
  const best = JSON.parse(readFileSync(join(ROOT, 'data/best.json'), 'utf8'));
  assert.equal(payload.count, 20, 'best.json carries the top 20 count');
  assert.equal(payload.picks.length, 20, 'best.json lists all 20 picks');
  assert.equal(payload.updated, best.updated, 'best.json carries the editorial updated date');
  payload.picks.forEach((pick, i) => {
    const e = best.entries[i];
    assert.equal(pick.rank, i + 1, `pick ${i} rank`);
    assert.equal(pick.slug, e.slug, `pick ${i} slug`);
    assert.equal(pick.why, e.why, `pick ${i} why`);
    assert.ok(pick.name && pick.free_tier && pick.docs_url, `${e.slug}: pick carries its full profile`);
  });
});

test('the explorer does not claim a column sort before the user chooses one', () => {
  const explorer = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  assert.match(explorer, /<th data-key="name" tabindex="0" role="button" aria-sort="none">API<\/th>/);
});

test('the explorer homepage leaves the table immediately after its controls', () => {
  const p = join(ROOT, 'site/index.html');
  const index = readFileSync(p, 'utf8');
  assert.doesNotMatch(index, /Recently re-verified|class="recent"/);
  assert.match(index, /<main id="explorer">\s*<div class="wrap">\s*<table id="table"/);
});
test('any provider sampling ASR/audio models declares audio in modalities', () => {
  const { providers } = JSON.parse(readFileSync(DATA, 'utf8'));
  const AUDIO_ID = /(whisper|asr|audio|transcri|stt|tts|voice|speech)/i;
  for (const p of providers) {
    if (!Array.isArray(p.models_free)) continue;
    const audioModels = p.models_free.filter((m) => AUDIO_ID.test(m));
    assert.ok(audioModels.length === 0 || (p.modalities || []).includes('audio'),
      `${p.slug} samples audio/ASR models (${audioModels.join(', ')}) but modalities is [${(p.modalities || []).join(', ')}]`);
  }
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
test('a confirmed card requirement is never hidden in the README top-20 or the explorer', () => {
  const { providers } = JSON.parse(readFileSync(DATA, 'utf8'));
  const best = JSON.parse(readFileSync(join(ROOT, 'data/best.json'), 'utf8'));
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const explorer = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  const bySlug = new Map(providers.map((p) => [p.slug, p]));
  const walled = providers.filter((p) => p.card_required === true);
  assert.ok(walled.length, 'dataset has at least one card-gated provider to check');

  // README: any top-20 pick that requires a card must say so.
  for (const e of best.entries) {
    const p = bySlug.get(e.slug);
    if (p && p.card_required === true) {
      const row = readme.split('\n').find((l) => l.includes(`](${p.docs_url})`));
      assert.ok(row, `${p.slug}: no README top-20 row found`);
      assert.match(row, /💳 card required/, `${p.slug}: README hides the card requirement`);
    }
  }

  // Explorer: the full-list surface must show the card flag for every gated provider.
  for (const p of walled) {
    const row = explorer.split('\n').find((l) => l.includes(`href="p/${p.slug}"`));
    assert.ok(row, `${p.slug}: no explorer row found`);
    assert.match(row, /aria-label="card"/, `${p.slug}: explorer row hides the card requirement`);
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


// ---------- shared row renderer (lib/rows.mjs → site/shared-rows.js) ----------
// The home table is SSR'd and client-repainted from ONE function. These tests
// pin what that function must keep guaranteeing: determinism for a fixed
// reference date, freshness-aware verified badges, escaping, slug guard, and
// that the client never re-implements the row markup.

test('explorer row HTML is deterministic for a fixed reference date', () => {
  const p = { slug: 'demo', name: 'Demo', category: 'ongoing', verified: true, last_verified: '2026-07-20', added: '2026-07-01' };
  const a = explorerRowHtml(p, { now: '2026-08-13' });
  const b = explorerRowHtml(p, { now: '2026-08-13' });
  assert.equal(a, b);
});

test('the verified badge colours by freshness — fresh / due / stale', () => {
  const mk = (daysAgo) => {
    const d = new Date('2026-08-13T00:00:00Z'); d.setUTCDate(d.getUTCDate() - daysAgo);
    return { slug: 'demo', name: 'Demo', category: 'ongoing', verified: true, last_verified: d.toISOString().slice(0, 10) };
  };
  const row = (p) => explorerRowHtml(p, { now: '2026-08-13' });
  assert.match(row(mk(10)), /badge b-ok/, 'fresh entry must stay green');
  assert.match(row(mk(75)), /badge b-warn/, 'due entry must turn yellow');
  assert.match(row(mk(95)), /badge b-stale/, 'stale entry must turn red');
  assert.match(row(mk(75)), /title="Verified 75d ago/, 'due badge explains its age');
});

test('row fields are escaped before innerHTML (XSS)', () => {
  const evil = (field) => ({ slug: 'demo', name: 'Demo', category: 'ongoing', [field]: '<script>alert(1)</script>' });
  for (const field of ['name', 'free_tier', 'notes', 'best_for']) {
    const out = explorerRowHtml(evil(field), { now: '2026-08-13' });
    assert.ok(!/<script>/i.test(out), field + ' must not reach innerHTML raw');
    assert.ok(out.includes('&lt;script&gt;'), field + ' must be escaped');
  }
});

test('provider slugs are guarded and links stay extension-less', () => {
  const good = explorerRowHtml({ slug: 'openai-compatible-free-apis', name: 'X', category: 'ongoing', verified: true, last_verified: '2026-08-01' }, { now: '2026-08-13' });
  assert.match(good, /href="p\/openai-compatible-free-apis"/);
  assert.ok(!good.includes('.html'), 'client link must match the clean-URL standard (#132)');
  const bad = explorerRowHtml({ slug: '../evil', name: 'X', category: 'ongoing', verified: true, last_verified: '2026-08-01' }, { now: '2026-08-13' });
  assert.ok(!bad.includes('href="p/'), 'non-kebab slug must not become a link');
});

test('the client explorer uses the shared row renderer, not its own copy', () => {
  const explorer = readFileSync(join(ROOT, 'site/explorer.js'), 'utf8');
  assert.match(explorer, /FLLM_ROWS.rowHtml/, 'explorer must repaint with the shared renderer');
  assert.doesNotMatch(explorer, /ROW_SKELETON/, 'explorer must not re-implement the row skeleton');
  assert.doesNotMatch(explorer, /flagMini|verCell|SLUG_RE/, 'explorer must not re-implement row markup');
});

test('the server render and the shared emission use the same row source', () => {
  const build = readFileSync(join(ROOT, 'scripts/build.mjs'), 'utf8');
  assert.match(build, /rows.explorerRowHtml/, 'SSR must call the shared row function');
  assert.match(build, /freshnessStatus: \$\{freshnessStatus\.toString\(\)\}/, 'shared-rules.js must ship freshnessStatus to the client');
  assert.match(build, /rows\.clientBundle\(\)/, 'build must write the shared-rows bundle from lib/rows.mjs');
  assert.match(build, /site\/shared-rows\.js/, 'build must emit shared-rows.js');
});

test('footer star button is block-level so its margin-top is not inert', () => {
  // Regression for the verified-badge / Star-on-GitHub stacking fix: the
  // global .star-btn rule is inline-flex, which makes margin-top inert. The
  // footer override must be block-level (display: flex) or the badge and
  // button silently share a line again.
  const css = readFileSync(join(ROOT, 'site/styles.css'), 'utf8');
  const rules = new Map();
  for (const m of css.matchAll(/\s*([^{}]+)\s*\{([^{}]*)\}/g)) {
    // selectors may carry leading CSS comments (the global .star-btn rule
    // is introduced by a /* star button */ comment) - strip them so the
    // map key is the bare selector.
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (sel.includes('.star-btn')) rules.set(sel, m[2]);
  }
  const footerRule = rules.get('.footer-brand .star-btn');
  assert.ok(footerRule, 'must keep a .footer-brand .star-btn override');
  assert.match(footerRule, /display\s*:\s*flex/, 'footer override must be block-level');
  assert.match(footerRule, /margin-top\s*:\s*18px/, 'footer override must keep the 18px gap');
  const globalRule = rules.get('.star-btn');
  assert.ok(globalRule && /display\s*:\s*inline-flex/.test(globalRule), 'global .star-btn stays inline-flex elsewhere');
});

// ---------- client configs (LiteLLM + OpenAI SDK) and the published schema ----------

// No YAML parser in devDependencies (and none is added for this): the generator
// emits a fixed subset — comments, `model_list:`, and entries whose scalars are
// JSON strings — so the test parses that grammar strictly, line by line, and
// fails on any line outside it.
function parseLitellm(yaml) {
  const lines = yaml.split('\n');
  assert.equal(lines.at(-1), '', 'file ends with a newline');
  const entries = [];
  let seenList = false;
  let cur = null;
  const STR = '("(?:[^"\\\\]|\\\\.)*")';
  const rx = {
    item: new RegExp(`^  - model_name: ${STR}$`),
    params: /^    litellm_params:$/,
    field: new RegExp(`^      (model|api_base|api_key): ${STR}(  # set a model id)?$`),
  };
  for (const [i, line] of lines.slice(0, -1).entries()) {
    if (line === '' || /^\s*#/.test(line)) continue;
    if (line === 'model_list:') { assert.ok(!seenList, 'one model_list'); seenList = true; continue; }
    assert.ok(seenList, `line ${i + 1} before model_list: ${line}`);
    let m;
    if ((m = line.match(rx.item))) { cur = { model_name: JSON.parse(m[1]), litellm_params: {}, marked: false, hasParams: false }; entries.push(cur); continue; }
    if (rx.params.test(line)) { assert.ok(cur && !cur.hasParams, `line ${i + 1}: litellm_params out of place`); cur.hasParams = true; continue; }
    if ((m = line.match(rx.field))) {
      assert.ok(cur && cur.hasParams, `line ${i + 1}: field outside litellm_params`);
      assert.ok(!(m[1] in cur.litellm_params), `line ${i + 1}: duplicate ${m[1]}`);
      cur.litellm_params[m[1]] = JSON.parse(m[2]);
      if (m[3]) cur.marked = true;
      continue;
    }
    assert.fail(`line ${i + 1} is outside the generated YAML grammar: ${JSON.stringify(line)}`);
  }
  assert.ok(seenList, 'model_list present');
  return entries;
}

const ccBase = { verified: true, last_verified: '2026-10-01', openai_compatible: true, docs_url: 'https://example.com/docs' };
const ccFixture = [
  { ...ccBase, slug: 'alpha', name: 'Alpha', openai_base_url: 'https://api.alpha.test/v1', env_key: 'ALPHA_API_KEY', models_free: ['a-small', 'org/a-large:free'] },
  { ...ccBase, slug: 'beta', name: 'Beta', openai_base_url: 'https://api.beta.test/v1', env_key: 'BETA_API_KEY', models_free: null },
  { ...ccBase, slug: 'gamma', name: 'Gamma', openai_base_url: 'https://api.gamma.test/accounts/{account_id}/v1', env_key: 'GAMMA_TOKEN', models_free: [] },
  { ...ccBase, slug: 'unverified', name: 'Unverified', verified: false, last_verified: null, openai_base_url: 'https://u.test/v1', env_key: 'U_KEY', models_free: ['m'] },
  { ...ccBase, slug: 'not-openai', name: 'Not OpenAI', openai_compatible: false, openai_base_url: null, env_key: 'N_KEY', models_free: ['m'] },
  { ...ccBase, slug: 'unknown-compat', name: 'Unknown', openai_compatible: null, openai_base_url: 'https://x.test/v1', env_key: 'X_KEY', models_free: ['m'] },
  { ...ccBase, slug: 'no-base', name: 'No base', openai_base_url: null, env_key: 'NB_KEY', models_free: ['m'] },
  { ...ccBase, slug: 'no-env', name: 'No env', openai_base_url: 'https://ne.test/v1', models_free: ['m'] },
];

test('client configs include only verified OpenAI-compatible providers with a base URL and env key', () => {
  assert.deepEqual(clientConfigProviders(ccFixture).map((p) => p.slug), ['alpha', 'beta', 'gamma']);
  assert.deepEqual(openaiClients(ccFixture)[0], {
    slug: 'alpha', name: 'Alpha', base_url: 'https://api.alpha.test/v1', env_key: 'ALPHA_API_KEY',
    models_free: ['a-small', 'org/a-large:free'], docs_url: 'https://example.com/docs', last_verified: '2026-10-01',
  });
  assert.equal(openaiClients(ccFixture)[1].models_free, null);
});

test('litellm.yaml has one model_list entry per (provider, model) and a marked placeholder otherwise', () => {
  const yaml = litellmYaml({ version: '9.8.7', generated: '2026-01-02', providers: ccFixture });
  assert.match(yaml, /^# .*\n# Dataset version 9\.8\.7, generated 2026-01-02\.\n/);
  assert.match(yaml, /terms change without notice/i);
  assert.match(yaml, /https:\/\/docs\.litellm\.ai\/docs\/proxy\/configs/);
  const entries = parseLitellm(yaml);
  assert.deepEqual(entries.map((e) => e.model_name), ['alpha/a-small', 'alpha/org/a-large:free', 'beta', 'gamma']);
  for (const e of entries) {
    assert.deepEqual(Object.keys(e.litellm_params).sort(), ['api_base', 'api_key', 'model'], `${e.model_name}: exactly model, api_base, api_key`);
    assert.match(e.litellm_params.model, /^openai\/./, `${e.model_name}: openai/ prefix`);
    assert.match(e.litellm_params.api_key, /^os\.environ\/[A-Z][A-Z0-9_]*$/, `${e.model_name}: os.environ/<ENV_KEY>`);
  }
  assert.deepEqual(entries[1].litellm_params, { model: 'openai/org/a-large:free', api_base: 'https://api.alpha.test/v1', api_key: 'os.environ/ALPHA_API_KEY' });
  assert.equal(entries[2].litellm_params.model, `openai/${MODEL_PLACEHOLDER}`);
  assert.ok(entries[2].marked && entries[3].marked && !entries[0].marked, 'only placeholder models carry "# set a model id"');
  assert.match(yaml, /# Gamma[^\n]*\n  # api_base contains a \{placeholder\}/);
  for (const slug of ['unverified', 'not-openai', 'unknown-compat', 'no-base', 'no-env']) {
    assert.ok(!yaml.includes(slug), `${slug} must not appear`);
  }
});

test('litellm.yaml quotes values so YAML-special characters stay literal', () => {
  const tricky = [{ ...ccBase, slug: 'tricky', name: 'Tricky', openai_base_url: 'https://t.test/v1', env_key: 'T_KEY', models_free: ['a: b # c', 'say "hi"'] }];
  const entries = parseLitellm(litellmYaml({ version: '1.0.0', generated: '2026-01-01', providers: tricky }));
  assert.deepEqual(entries.map((e) => e.litellm_params.model), ['openai/a: b # c', 'openai/say "hi"']);
});

test('the built client configs match the dataset, are registered, and the schema is published verbatim', () => {
  const v1 = join(ROOT, 'site/api/v1');
  if (!existsSync(join(v1, 'litellm.yaml'))) run(['scripts/build.mjs']);
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  const eligible = data.providers.filter((p) => p.verified === true && p.openai_compatible === true && p.openai_base_url && p.env_key);
  assert.ok(eligible.length > 0, 'the real dataset has eligible providers');

  const yaml = readFileSync(join(v1, 'litellm.yaml'), 'utf8');
  assert.ok(yaml.includes(`# Dataset version ${data.version}, generated ${data.generated}.`), 'header uses data.version and data.generated');
  const entries = parseLitellm(yaml);
  const expectedCount = eligible.reduce((n, p) => n + (p.models_free && p.models_free.length ? p.models_free.length : 1), 0);
  assert.equal(entries.length, expectedCount);
  const envKeys = new Set(eligible.map((p) => `os.environ/${p.env_key}`));
  for (const e of entries) assert.ok(envKeys.has(e.litellm_params.api_key), `${e.model_name}: env key of an eligible provider`);

  const clients = JSON.parse(readFileSync(join(v1, 'openai-clients.json'), 'utf8'));
  assert.equal(clients.version, data.version);
  assert.equal(clients.generated, data.generated);
  assert.equal(clients.count, eligible.length);
  assert.deepEqual(clients.clients.map((c) => c.slug), eligible.map((p) => p.slug));
  for (const c of clients.clients) assert.match(c.env_key, /^[A-Z][A-Z0-9_]*$/);

  // env_key stays out of every other API file
  assert.ok(!readFileSync(join(v1, 'providers.json'), 'utf8').includes('"env_key"'), 'providers.json still strips env_key');

  const index = JSON.parse(readFileSync(join(v1, 'index.json'), 'utf8'));
  assert.equal(index.endpoints.litellm, 'v1/litellm.yaml');
  assert.equal(index.endpoints['openai-clients'], 'v1/openai-clients.json');
  assert.equal(index.endpoints.schema, 'v1/schema.json');

  assert.ok(readFileSync(join(v1, 'schema.json')).equals(readFileSync(join(ROOT, 'data/schema.json'))), 'schema.json is a byte copy of data/schema.json');

  const page = readFileSync(join(ROOT, 'site/api/index.html'), 'utf8');
  for (const needle of ['v1/litellm.yaml', 'v1/openai-clients.json', 'v1/schema.json', 'docs/api.md', 'from openai import OpenAI']) {
    assert.ok(page.includes(needle), `API page mentions ${needle}`);
  }
});
