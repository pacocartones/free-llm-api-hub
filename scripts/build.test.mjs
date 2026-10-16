// Minimal real tests over the build pipeline (node --test).
// Covers: serializer round-trip, validator honesty rules, existing self-tests,
// build idempotency, one generated README row matching the data, and the
// generated client configs (LiteLLM + OpenAI SDK) and published JSON Schema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpFile } from './lib/tmp.mjs';
import { privateTree } from './lib/private-tree.mjs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { ORDER, roundTripError, serialize } from './_serialize.mjs';
import { freshnessBadge, freshnessColor, freshnessStatus, recScore, SLA_DAYS, DUE_SOON_DAYS } from './lib/rules.mjs';
import { esc, stripTags } from './lib/escape.mjs';
import { mineProviderHistory, assertHistoryPlausible, historyFromRevisions } from './lib/history.mjs';
import { isoWeek, flattenFieldChanges, groupChangesByWeek, changesRss, xmlEsc, reportChangeUrl } from './lib/changes.mjs';
import { monthlyReport, reportMonths, monthEndDate } from './lib/state.mjs';
import { externalContributors, countExternalContributors, githubProfileUrl } from './lib/contributors.mjs';
import { buildOgManifest } from './lib/og.mjs';
import { explorerRowHtml } from './lib/rows.mjs';
import { labelTables } from './lib/tables.mjs';
import { markNewTabLinks } from './lib/links.mjs';
import { weeklyPacing, weeklyBatch, WEEKLY_CAP, MIN_AGE_DAYS } from './lib/pacing.mjs';
import { clientConfigProviders, openaiClients, litellmYaml, MODEL_PLACEHOLDER } from './lib/client-config.mjs';
import { requirementsHtml, limitsHtml, glanceHtml, modelsHtml, dataPolicyHtml } from './lib/provider-sections.mjs';
import { compareTableHtml, comparisonCategory, sameComparisonCategory, selectComparePairs, COMPARE_PAGE_CAP, COMPARE_PER_PROVIDER_CAP, COMPARE_MAX as COMPARE_MAX_SLOTS } from './lib/compare.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
// The builds of this file run in a private copy of the tree (see lib/private-tree.mjs): `node --test` runs the test
// files in parallel and two builds on the same tree race on site/p.
const ROOT = privateTree(REPO);
const DATA = join(ROOT, 'data/providers.json');
// What the build would touch in the tree of the repository, read before any test runs (see the last test).
const GENERATED_IN_REPO = ['site/p', 'site/sitemap.xml', 'site/api/v1/index.json', 'site/collections'];
const mtimes = (root) => GENERATED_IN_REPO.map((rel) => (existsSync(join(root, rel)) ? statSync(join(root, rel)).mtimeMs : null));
const REPO_MTIMES_AT_START = mtimes(REPO);
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
  const fixture = tmpFile('providers.json');
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
  const fixture = tmpFile('providers.json');
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
  const fixture = tmpFile('providers.json');
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
  const fixture = tmpFile('providers.json');
  writeFileSync(fixture, JSON.stringify(data));
  assert.equal(exitOk(['scripts/validate.mjs', fixture]), false);
});

for (const [label, value] of [
  ['a model list', 'Various open-weight models'],
  ['a model count', '30+ models: LLMs, embeddings, image'],
  ['a pricing note', 'Model APIs are priced per token; dedicated deployments by compute time (per minute)'],
  ['an empty string', ''],
]) {
  test(`validate rejects rate_limits holding ${label}`, () => {
    const data = JSON.parse(readFileSync(DATA, 'utf8'));
    data.providers[0].rate_limits = value;
    const fixture = tmpFile('providers.json');
    writeFileSync(fixture, JSON.stringify(data));
    assert.equal(exitOk(['scripts/validate.mjs', fixture]), false);
  });
}

for (const value of ['30 RPM / 14,400 RPD', '10,000 Neurons per day', 'Not published by the provider', 'Per-model limits are shown only in the console after sign-in']) {
  test(`validate accepts rate_limits "${value}"`, () => {
    const data = JSON.parse(readFileSync(DATA, 'utf8'));
    data.providers[0].rate_limits = value;
    const fixture = tmpFile('providers.json');
    writeFileSync(fixture, JSON.stringify(data));
    assert.equal(exitOk(['scripts/validate.mjs', fixture]), true);
  });
}

test('validate rejects an unverified entry that still carries a date', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  data.providers[0].verified = false;
  data.providers[0].last_verified = '2026-01-01';
  const fixture = tmpFile('providers.json');
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
  const fixture = tmpFile('providers.json');
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
  const fixture = tmpFile('providers.json');
  writeFileSync(fixture, JSON.stringify(data));
  assert.equal(exitOk(['scripts/validate.mjs', fixture]), true);
});

test('validate rejects a probe report that references a removed provider', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  const fixture = tmpFile('providers.json');
  writeFileSync(fixture, JSON.stringify(data));
  // github-models was retired from the dataset on 2026-08-02; a report that
  // still lists it must fail (this is the exact nine-day drift that hid until
  // 2026-08-11).
  const report = JSON.parse(readFileSync(join(ROOT, 'data/probe-report.json'), 'utf8'));
  report.results.push({ slug: 'github-models', env_key: 'GITHUB_TOKEN', key_present: false, status: 'skipped-no-key' });
  report.count = report.results.length;
  const reportFixture = tmpFile('probe-report.json');
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

// ---------- one standard page header ----------
test('every generated page has the same centred header: crumbs, one title and, when there is one, the lede', () => {
  run(['scripts/build.mjs']);
  const walk = (dir) => readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    return statSync(f).isDirectory() ? (n === 'node_modules' ? [] : walk(f)) : (f.endsWith('.html') ? [f] : []);
  });
  // The home page has its own hero (hand-written), 404 is a hand-written page, and two index files are redirect stubs.
  const exceptions = new Set(['index.html', '404.html', 'collections/index.html', 'guides/index.html']);
  let checked = 0;
  for (const file of walk(join(ROOT, 'site'))) {
    const rel = relative(join(ROOT, 'site'), file);
    if (exceptions.has(rel) || rel.startsWith('og')) continue;
    const html = readFileSync(file, 'utf8');
    const heroes = html.match(/<section class="page-hero[^"]*">/g) || [];
    assert.equal(heroes.length, 1, `${rel}: one page header`);
    assert.match(heroes[0], /class="page-hero (?:model-hero|prov-hero)"/, `${rel}: the header is the centred one, not the old left-aligned variant`);
    const hero = html.slice(html.indexOf(heroes[0]), html.indexOf('</section>', html.indexOf(heroes[0])));
    assert.equal((hero.match(/<nav class="crumbs">/g) || []).length, 1, `${rel}: breadcrumbs`);
    assert.equal((hero.match(/<h1>/g) || []).length, 1, `${rel}: one title`);
    checked += 1;
  }
  assert.ok(checked > 100, `the check covered ${checked} pages`);
  // and the style centres it by default, so a new page cannot come out left-aligned by forgetting a class
  const css = readFileSync(join(ROOT, 'site/styles.css'), 'utf8');
  assert.match(css, /\.page-hero \.crumbs, \.page-hero h1 \{ text-align: center; \}/);
  assert.doesNotMatch(css, /\.model-hero/);
});

// ---------- subtle interaction (CSS only) ----------
test('the interaction layer is CSS only and respects prefers-reduced-motion and touch', () => {
  const css = readFileSync(join(ROOT, 'site/styles.css'), 'utf8');
  for (const token of ['--t-fast', '--t-base', '--t-slow', '--ease']) assert.match(css, new RegExp(`${token}:`), `${token} is defined once`);
  assert.equal((css.match(/--t-fast:/g) || []).length, 1, 'the tokens are defined once');
  // with reduced motion every movement goes: transitions, animations and smooth scrolling
  const reduce = css.match(/@media \(prefers-reduced-motion: reduce\) \{[^\n]*\}/);
  assert.ok(reduce, 'a reduced-motion block exists');
  assert.match(reduce[0], /transition: none !important/);
  assert.match(reduce[0], /animation: none !important/);
  assert.match(reduce[0], /scroll-behavior: auto/);
  // the underline of text links thickens only where there is a hover; links that are underlined at rest keep their underline
  assert.match(css, /@media \(hover: hover\) \{[^@]*transition: text-decoration-thickness var\(--t-base\) var\(--ease\)[^@]*text-decoration-thickness: 2px/);
  const hoverBlock = css.slice(css.indexOf('@media (hover: hover) {\n  /* These links'), css.indexOf('.chip:active'));
  assert.doesNotMatch(hoverBlock, /text-decoration: none|background:/, 'the hover effect never removes the underline');
  // the page-change fade and the target highlight are a layer that is off with reduced motion
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{[^@]*@keyframes target-flash[\s\S]*?@view-transition \{ navigation: auto; \}/);
  // only movement properties and colours: no property that moves the layout inside the new layer
  const layer = css.slice(css.indexOf('/* ---------- subtle interaction'), css.indexOf('/* ---------- responsive ---------- */'));
  assert.doesNotMatch(layer, /\b(width|height|margin|padding|top|left)\s*:/, 'the layer moves nothing that changes the layout');
  // and no script: the layer adds none
  for (const js of ['site/site.js', 'site/explorer.js', 'site/widget.js']) assert.doesNotMatch(readFileSync(join(ROOT, js), 'utf8'), /view-transition|target-flash/);
});

test('sitemap.xml lists no paginated updates pages (their count follows the commit count)', () => {
  const sitemap = readFileSync(join(ROOT, 'site/sitemap.xml'), 'utf8');
  assert.match(sitemap, /<loc>https:\/\/freellmapihub\.com\/updates<\/loc>/);
  assert.doesNotMatch(sitemap, /\/updates\/page\//, 'a page count tied to git history would make the drift-gated sitemap change on every merge');
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

test('build removes pages and badges of providers no longer in the dataset', () => {
  writeFileSync(join(ROOT, 'site/badges/removed-provider.json'), '{}');
  writeFileSync(join(ROOT, 'site/p/removed-provider.html'), '<p>stale</p>');
  run(['scripts/build.mjs']);
  assert.equal(existsSync(join(ROOT, 'site/badges/removed-provider.json')), false, 'stale badge must be pruned');
  assert.equal(existsSync(join(ROOT, 'site/p/removed-provider.html')), false, 'stale provider page must be pruned');
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

test('external contributors exclude the maintainers and bots by login and count one per person', () => {
  const commits = [
    { login: 'pacocartones', name: 'pacocartones', subject: 'maintainer' },
    { login: 'PacoCartones', name: 'Paco', subject: 'maintainer, other case' },
    { login: 'LeonMAG', name: 'Leon Marcos', subject: 'maintainer' },
    { login: 'github-actions[bot]', name: 'github-actions[bot]', subject: 'bot' },
    { login: null, name: 'dependabot[bot]', subject: 'bot without an account' },
    { login: 'JhansiOruganti-43', name: 'Jhansi Oruganti', subject: 'first' },
    { login: 'jhansioruganti-43', name: 'Jhansi Oruganti', subject: 'second, same person' },
    { login: 'another-dev', name: 'Another Dev', subject: 'external' },
    { login: null, name: 'No Account', subject: 'commit the API could not link' },
  ];
  const got = externalContributors(commits);
  assert.deepEqual(got.map((c) => c.login ?? c.name), ['JhansiOruganti-43', 'another-dev', 'No Account']);
  assert.equal(got[0].subject, 'first', 'a person is listed with their FIRST commit');
  assert.equal(countExternalContributors(commits), 3);
  assert.equal(githubProfileUrl(got[1]), 'https://github.com/another-dev');
  assert.equal(githubProfileUrl(got[2]), null);
});

test('external contributors tolerate empty and malformed input', () => {
  assert.deepEqual(externalContributors([]), []);
  assert.deepEqual(externalContributors(undefined), []);
  assert.deepEqual(externalContributors([null, { login: null, name: '', subject: 'x' }, { login: 'a', name: 'A', subject: '' }]), []);
});

test('contributor data and scripts carry no e-mail address of any kind', () => {
  // Identity is the GitHub login. Reports name the file, never the address.
  const anyAddress = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
  for (const rel of ['data/contributors.json', 'scripts/lib/contributors.mjs', 'scripts/update-contributors.mjs']) {
    assert.ok(!anyAddress.test(readFileSync(join(ROOT, rel), 'utf8')), `${rel} contains an e-mail address`);
  }
  assert.ok(anyAddress.test('someone@example.invalid'), 'the pattern would catch an address');
});

test('no tracked file carries a personal mailbox address', () => {
  // Contributors are identified by GitHub login; fixtures use the reserved .invalid TLD.
  const personal = /[\w.+-]+@(?:gmail|googlemail|hotmail|outlook|live|yahoo|icloud|proton(?:mail)?|pm)\.[a-z.]+/i;
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
  const hits = [];
  for (const rel of files) {
    if (/\.(png|jpe?g|webp|gif|woff2?|ico)$/i.test(rel)) continue;
    if (personal.test(readFileSync(join(ROOT, rel), 'utf8'))) hits.push(rel);
  }
  assert.deepEqual(hits, [], 'files that contain a personal mailbox address (names only; the address is never printed)');
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

import { topEntries } from './lib/best.mjs';
const topOfData = () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  return topEntries(data.providers, {
    editorial: JSON.parse(readFileSync(join(ROOT, 'data/editorial.json'), 'utf8')),
    probeReport: JSON.parse(readFileSync(join(ROOT, 'data/probe-report.json'), 'utf8')),
    now: new Date(data.generated + 'T12:00:00Z'),
  });
};

test('the README top-10 table renders every provider of the score top with its score and verified date', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const top = topOfData();
  assert.ok(top.length > 0 && top.length <= 10, 'the README shows up to ten providers');
  for (const e of top) {
    assert.ok(readme.includes(`[${e.p.name}](${e.p.docs_url})`), `${e.p.slug}: README links the provider docs`);
    assert.ok(readme.includes(`✅ ${e.p.last_verified}`), `${e.p.slug}: README shows the verification date`);
    assert.ok(readme.includes(`${e.total.toFixed(1)}<br><sub>${e.confirmed} of ${e.of} inputs</sub>`), `${e.p.slug}: README shows the score and its confirmed inputs`);
  }
  assert.ok(!/top 20|top-20/i.test(readme), 'no top 20 text remains in the README');
});

test('/api/v1/best.json exposes the score top with its parts and full profiles', () => {
  const p = join(ROOT, 'site/api/v1/best.json');
  run(['scripts/build.mjs']);
  const payload = JSON.parse(readFileSync(p, 'utf8'));
  const top = topOfData();
  assert.equal(payload.count, top.length, 'best.json carries the top count');
  assert.equal(payload.picks.length, top.length);
  payload.picks.forEach((pick, i) => {
    assert.equal(pick.rank, i + 1, `pick ${i} rank`);
    assert.equal(pick.slug, top[i].p.slug, `pick ${i} slug`);
    assert.equal(pick.podium, i < 3, `pick ${i} podium`);
    assert.equal(pick.score, Math.round(top[i].total * 10) / 10, `pick ${i} score`);
    assert.ok(pick.parts && pick.of === 6, `${pick.slug}: pick carries the parts of its score`);
    assert.ok(pick.name && pick.free_tier && pick.docs_url, `${pick.slug}: pick carries its full profile`);
  });
});

test('/best shows the podium of three and the methodology page states the rules', () => {
  run(['scripts/build.mjs']);
  const top = topOfData();
  const best = readFileSync(join(ROOT, 'site/best/index.html'), 'utf8');
  assert.equal((best.match(/class="best-item best-podium /g) || []).length, Math.min(3, top.length), 'three podium cards');
  assert.equal((best.match(/<li class="best-item/g) || []).length, top.length, 'one card per provider of the top');
  for (const e of top) assert.ok(best.includes(`href="../p/${e.p.slug}"`), `${e.p.slug} is on /best`);
  const method = readFileSync(join(ROOT, 'site/best/methodology/index.html'), 'utf8');
  assert.match(method, /Money scores nothing/);
  assert.match(method, /editorial rating/);
  assert.match(method, /30/);
  assert.match(method, /internal rubric behind those ratings is not published/);
  assert.match(method, new RegExp(`Data of ${JSON.parse(readFileSync(DATA, 'utf8')).generated}`));
  assert.match(readFileSync(join(ROOT, 'site/sitemap.xml'), 'utf8'), /<loc>https:\/\/freellmapihub\.com\/best\/methodology\/<\/loc>/);
});

test('the explorer does not claim a column sort before the user chooses one', () => {
  const explorer = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  assert.match(explorer, /<th data-key="name" scope="col" aria-sort="none"><button type="button" class="th-sort">API<\/button><\/th>/);
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
  assert.match(build, /const freshnessStatus = \$\{freshnessStatus\.toString\(\)\}/, 'shared-rules.js must ship freshnessStatus to the client');
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

// ---------- weekly change feed + monthly state report (fixtures) ----------
// Pure functions from lib/changes.mjs and lib/state.mjs, exercised on small
// fixture histories so the numbers are known by construction, not read off
// the live dataset.
const prov = (slug, extra = {}) => ({
  slug, name: slug.toUpperCase(), category: 'ongoing', free_type: 'perpetual', free_tier: 'x', rate_limits: '10 rpm',
  notes: '', modalities: ['text'], card_required: null, phone_required: null, commercial_ok: null, openai_compatible: null,
  verified: true, last_verified: '2026-01-01', ...extra,
});
const rev = (date, providers) => ({ date, parsed: { providers } });

test('isoWeek follows ISO-8601 at year boundaries', () => {
  assert.deepEqual(isoWeek('2021-01-03'), { key: '2020-W53', year: 2020, week: 53, start: '2020-12-28', end: '2021-01-03' });
  assert.equal(isoWeek('2024-12-30').key, '2025-W01');
  assert.equal(isoWeek('2026-01-01').key, '2026-W01');
  assert.deepEqual(isoWeek('2026-10-08'), { key: '2026-W41', year: 2026, week: 41, start: '2026-10-05', end: '2026-10-11' });
  assert.equal(isoWeek('2026-10-11').key, '2026-W41', 'Sunday closes the ISO week');
  assert.equal(isoWeek('2026-10-12').key, '2026-W42', 'Monday opens the next one');
});

test('history revisions carry field-level from/to values for the change feed', () => {
  const { historyBySlug, monthEnd } = historyFromRevisions([
    rev('2026-06-30', [prov('a'), prov('b')]),
    rev('2026-07-02', [prov('a', { rate_limits: '20 rpm', card_required: false }), prov('b')]),
    rev('2026-07-20', [prov('a', { rate_limits: '20 rpm', card_required: false }), prov('b', { notes: 'phone needed' }), prov('c')]),
  ]);
  assert.deepEqual(historyBySlug.a[1].changes, [
    { field: 'rate_limits', from: '10 rpm', to: '20 rpm' },
    { field: 'card_required', from: null, to: false },
  ]);
  assert.equal(historyBySlug.c[0].kind, 'added');
  assert.deepEqual(Object.keys(monthEnd), ['2026-06', '2026-07']);
  assert.equal(monthEnd['2026-07'].date, '2026-07-20', 'the month-end snapshot is the last revision of the month');
  assert.equal(monthEnd['2026-07'].providers.length, 3);
});

test('weekly grouping: newest week first, newest change first, 12-week window anchored on the newest change', () => {
  const ev = (date, field, from, to) => ({ date, kind: 'changed', fields: [field], text: 't', changes: [{ field, from, to }] });
  const history = {
    alpha: [{ date: '2026-01-01', kind: 'added', text: 'Added' }, ev('2026-10-05', 'rate_limits', '1', '2'), ev('2026-10-08', 'free_tier', 'a', 'b')],
    beta: [ev('2026-10-08', 'notes', '', 'catch'), ev('2026-09-30', 'card_required', null, true)],
    gamma: [ev('2026-07-13', 'free_tier', 'old', 'new'), ev('2026-07-12', 'free_tier', 'older', 'old')],
  };
  const flat = flattenFieldChanges(history, { alpha: 'Alpha', beta: 'Beta' });
  assert.equal(flat.length, 6, 'added events never enter the field feed');
  assert.deepEqual(flat.slice(0, 3).map((c) => [c.date, c.slug, c.field]), [
    ['2026-10-08', 'alpha', 'free_tier'], ['2026-10-08', 'beta', 'notes'], ['2026-10-05', 'alpha', 'rate_limits'],
  ]);
  assert.equal(flat.find((c) => c.slug === 'gamma').name, 'gamma', 'a provider no longer in the dataset falls back to its slug');

  const weeks = groupChangesByWeek(flat, { weeks: 12 });
  // 2026-W41 (Oct 5-11), 2026-W40 (Sep 28-Oct 4); 2026-W29 (Jul 13) is exactly 12 weeks
  // before W41 and falls outside, as does W28 (Jul 12). Empty weeks are omitted.
  assert.deepEqual(weeks.map((w) => [w.week, w.count]), [['2026-W41', 3], ['2026-W40', 1]]);
  assert.deepEqual(weeks[0].providers, ['Alpha', 'Beta']);
  assert.equal(weeks[0].lastDate, '2026-10-08');
  assert.equal(weeks[1].start, '2026-09-28');
  assert.deepEqual(groupChangesByWeek(flat, { weeks: 13 }).map((w) => w.week), ['2026-W41', '2026-W40', '2026-W29']);
  assert.deepEqual(groupChangesByWeek([], { weeks: 12 }), []);
});

// Minimal XML well-formedness: every tag balanced and properly nested, no
// stray '<', and every '&' starts a known entity or a numeric reference.
const assertWellFormedXml = (xml) => {
  const body = xml.replace(/^<\?xml[^?]*\?>\s*/, '');
  const stack = [];
  const tagRe = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g;
  let last = 0;
  let m;
  while ((m = tagRe.exec(body))) {
    const text = body.slice(last, m.index);
    assert.doesNotMatch(text, /</, `stray '<' before ${m[0]}`);
    assert.doesNotMatch(text, /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/, `bare '&' in "${text.slice(0, 60)}"`);
    if (m[1]) assert.equal(stack.pop(), m[2], `mismatched </${m[2]}>`);
    else if (!m[4]) stack.push(m[2]);
    last = tagRe.lastIndex;
  }
  assert.equal(body.slice(last).trim(), '', 'nothing after the root element');
  assert.deepEqual(stack, [], 'every element is closed');
  // eslint-disable-next-line no-control-regex
  assert.doesNotMatch(xml, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/, 'no XML-forbidden control characters');
};

test('the weekly RSS is well-formed and escapes provider names and values', () => {
  const nasty = 'Tom & Jerry <script>alert("x")</script> \u0007AI';
  const history = {
    tj: [{ date: '2026-10-08', kind: 'changed', fields: ['free_tier'], text: 't', changes: [{ field: 'free_tier', from: 'a & b', to: '<b>c</b>' }] }],
    ok: [{ date: '2026-09-29', kind: 'changed', fields: ['rate_limits', 'notes'], text: 't', changes: [{ field: 'rate_limits', from: '1', to: '2' }, { field: 'notes', from: '', to: 'x' }] }],
  };
  const weeks = groupChangesByWeek(flattenFieldChanges(history, { tj: nasty, ok: 'OK Labs' }));
  const xml = changesRss(weeks, { site: 'https://example.test' });
  assertWellFormedXml(xml);
  assert.equal((xml.match(/<item>/g) || []).length, 2, 'one item per ISO week');
  assert.doesNotMatch(xml, /<script/);
  assert.match(xml, /Tom &amp; Jerry &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; AI: free tier\./);
  assert.match(xml, /<guid isPermaLink="false">free-llm-api-hub-changes-2026-W41<\/guid>/);
  assert.match(xml, /<pubDate>Thu, 08 Oct 2026 00:00:00 GMT<\/pubDate>/);
  assert.match(xml, /<title>2026-W40 \(2026-09-28 to 2026-10-04\): 2 field changes across 1 provider<\/title>/);
  assert.ok(xml.indexOf('2026-W41') < xml.indexOf('2026-W40'), 'newest week first');
  assert.equal(xmlEsc(`a'b`), 'a&apos;b');
  assertWellFormedXml(changesRss([], { site: 'https://example.test' }));
});

test('the monthly state report computes its numbers from the snapshot and history', () => {
  const snapshot = [
    prov('a', { modalities: ['text', 'vision'], last_verified: '2026-07-01' }),
    prov('b', { category: 'trial', modalities: ['image'], last_verified: '2026-07-21' }),
    prov('c', { modalities: ['text', 'embeddings'], last_verified: '2026-06-01', added: '2026-07-15' }),
    prov('d', { verified: false, last_verified: null, category: 'trial', added: '2026-06-30' }),
  ];
  const history = {
    a: [{ date: '2026-07-02', kind: 'changed', fields: ['rate_limits', 'card_required'], text: 't' },
        { date: '2026-07-25', kind: 'changed', fields: ['rate_limits'], text: 't' },
        { date: '2026-08-01', kind: 'changed', fields: ['notes'], text: 't' }],
    b: [{ date: '2026-07-10', kind: 'added', text: 'Added' }],
    c: [{ date: '2026-06-30', kind: 'changed', fields: ['free_tier'], text: 't' }],
    gone: [{ date: '2026-07-03', kind: 'changed', fields: ['notes'], text: 't' }],
  };
  const r = monthlyReport({ month: '2026-07', asOf: monthEndDate('2026-07'), snapshot, historyBySlug: history, addedBySlug: { b: '2026-07-10' } });
  assert.equal(r.asOf, '2026-07-31');
  assert.equal(r.total, 4);
  assert.deepEqual(r.byCategory, { ongoing: 2, trial: 2 });
  assert.deepEqual(Object.fromEntries(r.byModality.map((m) => [m.modality, m.count])),
    { text: 3, vision: 1, image: 1, audio: 0, embeddings: 1, rerank: 0, ocr: 0 });
  assert.equal(r.verified, 3);
  assert.equal(r.verifiedShare, 0.75);
  // ages at 2026-07-31: a 30, b 10, c 60 → sorted [10, 30, 60]
  assert.deepEqual(r.freshness, { dated: 3, oldestDays: 60, medianDays: 30 });
  assert.equal(r.fieldChanges, 4, 'a: 2 + 1 in July, gone: 1; August and June events excluded');
  assert.deepEqual(r.providersChanged, [
    { slug: 'a', name: 'A', fields: ['rate_limits', 'card_required'] },
    { slug: 'gone', name: 'gone', fields: ['notes'] },
  ]);
  assert.deepEqual(r.added, [
    { slug: 'b', name: 'B', added: '2026-07-10' },
    { slug: 'c', name: 'C', added: '2026-07-15' },
  ], 'added comes from the `added` field (current data first), not from history events');

  const months = reportMonths({ '2026-08': { date: '2026-08-14', providers: [] }, '2026-07': { date: '2026-07-20', providers: snapshot } });
  assert.deepEqual(months.map((m) => [m.month, m.asOf]), [['2026-07', '2026-07-31'], ['2026-08', '2026-08-14']],
    'past months are measured at their end; the newest at its last revision');
  assert.equal(monthEndDate('2028-02'), '2028-02-29');
});

test('the "Report a change" URL prefills the inaccuracy form and is escaped on the page', () => {
  const repo = 'https://github.com/pacocartones/free-llm-api-hub';
  const url = reportChangeUrl({ slug: 'a-b', name: 'A&B "Labs" / 100% #1' }, repo);
  assert.equal(url, `${repo}/issues/new?template=inaccuracy.yml&provider=a-b&title=%5Boutdated%5D%20A%26B%20%22Labs%22%20%2F%20100%25%20%231`);
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('template'), 'inaccuracy.yml');
  assert.equal(parsed.searchParams.get('provider'), 'a-b');
  assert.equal(parsed.searchParams.get('title'), '[outdated] A&B "Labs" / 100% #1');
  // The form's provider input id really is `provider`, so GitHub can prefill it.
  assert.match(readFileSync(join(ROOT, '.github/ISSUE_TEMPLATE/inaccuracy.yml'), 'utf8'), /\n\s+id: provider\n/);

  const page = join(ROOT, 'site/p/groq.html');
  if (!existsSync(page)) run(['scripts/build.mjs']);
  assert.match(readFileSync(page, 'utf8'),
    /<a class="btn ghost" href="https:\/\/github\.com\/pacocartones\/free-llm-api-hub\/issues\/new\?template=inaccuracy\.yml&amp;provider=groq&amp;title=%5Boutdated%5D%20Groq"/);
});

test('the change feed and state reports are built but never pinned in derived-fingerprints.json', () => {
  run(['scripts/build.mjs']);
  for (const rel of ['site/changes/index.html', 'site/changes.xml', 'site/api/v1/changes.json', 'site/state/index.html']) {
    assert.ok(existsSync(join(ROOT, rel)), rel + ' should be generated');
  }
  const months = readdirSync(join(ROOT, 'site/state')).filter((f) => /^\d{4}-\d{2}$/.test(f));
  assert.ok(months.length > 0, 'at least one monthly report');
  assertWellFormedXml(readFileSync(join(ROOT, 'site/changes.xml'), 'utf8'));
  const api = JSON.parse(readFileSync(join(ROOT, 'site/api/v1/changes.json'), 'utf8'));
  assert.ok(api.weeks.length > 0 && api.weeks.length <= 12);
  for (let i = 1; i < api.weeks.length; i++) assert.ok(api.weeks[i - 1].start > api.weeks[i].start, 'weeks newest first');
  for (const c of api.weeks[0].changes) assert.deepEqual(Object.keys(c), ['date', 'slug', 'name', 'field', 'from', 'to']);
  assert.equal(JSON.parse(readFileSync(join(ROOT, 'site/api/v1/index.json'), 'utf8')).endpoints.changes, 'v1/changes.json');
  const history = JSON.parse(readFileSync(join(ROOT, 'site/api/v1/history.json'), 'utf8')).history;
  assert.equal(Object.values(history).flat().some((e) => 'changes' in e), false, 'history.json keeps its published shape');

  const pins = Object.keys(JSON.parse(readFileSync(join(ROOT, 'derived-fingerprints.json'), 'utf8')));
  for (const k of pins) {
    assert.ok(!k.startsWith('site/changes/') && !k.startsWith('site/state/') && k !== 'site/changes.xml' && k !== 'site/api/v1/changes.json',
      k + ' is git-log derived and must not be pinned');
  }
  const sitemap = readFileSync(join(ROOT, 'site/sitemap.xml'), 'utf8');
  assert.match(sitemap, /<loc>https:\/\/freellmapihub\.com\/changes\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/freellmapihub\.com\/state\/<\/loc>/);
  assert.doesNotMatch(sitemap, /\/state\/\d{4}-\d{2}\//, 'per-month URLs depend on commit dates, so they stay out of the drift-gated sitemap');
});

test('shared-rules.js runs on its own: every serialised rule resolves its constants', () => {
  // freeTypeRank reads FREE_TYPE_RANK and freshnessStatus reads SLA_DAYS by
  // name. Emitted as bare object properties they were out of scope, so the
  // client comparator threw on every repaint and the explorer never re-sorted
  // or filtered. Execute the emitted file with nothing else in scope.
  run(['scripts/build.mjs']);
  const win = {};
  new Function('window', readFileSync(join(ROOT, 'site/shared-rules.js'), 'utf8'))(win);
  const R = win.FLLM_RULES;
  assert.equal(R.freeTypeRank({ free_type: 'perpetual' }), 0);
  assert.equal(R.freeTypeRank({ free_type: 'trial-credit' }), 3);
  assert.equal(R.freeTypeRank({}), 4);
  assert.equal(R.freshnessStatus(10), freshnessStatus(10));
  assert.equal(R.freshnessStatus(SLA_DAYS + 1), 'stale');
  assert.equal(R.freshnessStatus(DUE_SOON_DAYS + 1), 'due');
  assert.equal(R.recScore({ card_required: false }), recScore({ card_required: false }));
  assert.equal(R.SLA_DAYS, SLA_DAYS);
  assert.equal(R.DUE_SOON_DAYS, DUE_SOON_DAYS);
  assert.ok(Array.isArray(R.FLAG_PAIRS) && R.FLAG_PAIRS.length > 0);
});

// ---------- provider compare view (#175) ----------
// Static /compare/<a>-vs-<b>/ pages: a small deterministic set of editorial
// picks compared pairwise where they share a modality. They are gitignored and
// pinned in derived-fingerprints.json, and sitemap.xml is drift-gated, so the
// selection and the bytes must be a pure function of the committed data.

test('compare pairs: only picks sharing a modality, ordered by rank, capped overall and per provider', () => {
  const mk = (slug, modalities) => ({ slug, name: slug.toUpperCase(), modalities });
  const ranked = [mk('a', ['text']), mk('b', ['text', 'audio']), mk('c', ['ocr']), mk('d', ['audio']), mk('e', ['text']), mk('f', ['ocr'])];
  const pairs = selectComparePairs(ranked, { cap: 30, perProvider: 10 });
  assert.deepEqual(pairs.map((p) => p.path), ['a-vs-b', 'a-vs-e', 'b-vs-d', 'b-vs-e', 'c-vs-f'],
    'rank-sum order (ties: higher-ranked member first), no pair without a shared modality');
  assert.deepEqual(pairs.find((p) => p.path === 'b-vs-d').shared, ['audio']);
  assert.deepEqual(selectComparePairs(ranked, { cap: 2, perProvider: 10 }).map((p) => p.path), ['a-vs-b', 'a-vs-e'], 'overall cap');
  assert.deepEqual(selectComparePairs(ranked, { cap: 30, perProvider: 1 }).map((p) => p.path), ['a-vs-b', 'c-vs-f'], 'per-provider cap');
  assert.deepEqual(selectComparePairs(ranked), selectComparePairs(ranked), 'deterministic');
  assert.deepEqual(selectComparePairs([mk('a', ['text']), { slug: '../x', name: 'X', modalities: ['text'] }]), [], 'a malformed slug never becomes a path');
});

test('compare pairs on the real ranking: at most 30, unique, shared modality, every page built', () => {
  const { providers } = JSON.parse(readFileSync(DATA, 'utf8'));
  const best = JSON.parse(readFileSync(join(ROOT, 'data/best.json'), 'utf8'));
  const ranked = best.entries.map((e) => providers.find((p) => p.slug === e.slug));
  const pairs = selectComparePairs(ranked);
  assert.ok(pairs.length > 0 && pairs.length <= COMPARE_PAGE_CAP, `got ${pairs.length} pairs`);
  assert.equal(new Set(pairs.map((p) => p.path)).size, pairs.length, 'no duplicate pages');
  for (const { a, b, shared } of pairs) {
    assert.ok(shared.length && shared.every((m) => a.modalities.includes(m) && b.modalities.includes(m)), `${a.slug}/${b.slug} share a modality`);
  }
  const uses = {};
  for (const { a, b } of pairs) { uses[a.slug] = (uses[a.slug] || 0) + 1; uses[b.slug] = (uses[b.slug] || 0) + 1; }
  assert.ok(Object.values(uses).every((n) => n <= COMPARE_PER_PROVIDER_CAP), 'per-provider cap holds');

  run(['scripts/build.mjs']);
  const sitemap = readFileSync(join(ROOT, 'site/sitemap.xml'), 'utf8');
  const pins = JSON.parse(readFileSync(join(ROOT, 'derived-fingerprints.json'), 'utf8'));
  // Dates a compare page may legitimately carry: the ones in the data.
  const dataDates = new Set(JSON.stringify(providers).match(/\d{4}-\d{2}-\d{2}/g));
  assert.match(sitemap, /<loc>https:\/\/freellmapihub\.com\/compare\/<\/loc>/);
  assert.ok(pins['site/compare/index.html'] && pins['site/shared-compare.js'], 'the compare view is pinned');
  const built = readdirSync(join(ROOT, 'site/compare')).filter((d) => d.includes('-vs-')).sort();
  assert.deepEqual(built, pairs.map((p) => p.path).sort(), 'exactly the selected pages are built (stale pages are removed)');
  for (const { a, b, path } of pairs) {
    const rel = `site/compare/${path}/index.html`;
    const html = readFileSync(join(ROOT, rel), 'utf8');
    assert.ok(html.includes(`<link rel="canonical" href="https://freellmapihub.com/compare/${path}/">`), `${rel}: canonical`);
    assert.ok(sitemap.includes(`<loc>https://freellmapihub.com/compare/${path}/</loc>`), `${rel}: in the sitemap`);
    assert.match(pins[rel] || '', /^[0-9a-f]{64}$/, `${rel}: pinned in derived-fingerprints.json`);
    assert.ok(html.includes(`<a href="../../p/${a.slug}">`) && html.includes(`<a href="../../p/${b.slug}">`), `${rel}: links both providers`);
    assert.ok(!html.includes(`href="../../compare/${path}/"`), `${rel}: does not list itself under other comparisons`);
    for (const d of html.match(/\d{4}-\d{2}-\d{2}/g) || []) {
      assert.ok(dataDates.has(d), `${rel}: date ${d} is not from the dataset (pages must not depend on the build day)`);
    }
    // provider pages suggest the comparisons they appear in, when both sides share a category
    for (const s of [a.slug, b.slug]) {
      const linked = readFileSync(join(ROOT, `site/p/${s}.html`), 'utf8').includes(`href="../compare/${path}/"`);
      assert.equal(linked, sameComparisonCategory(a, b), `p/${s} ${sameComparisonCategory(a, b) ? 'links' : 'does not suggest'} ${path}`);
    }
  }
});

test('the compare view loads its scripts under the CSP and the null tri-state reads "not confirmed"', () => {
  run(['scripts/build.mjs']);
  const index = readFileSync(join(ROOT, 'site/compare/index.html'), 'utf8');
  assert.match(index, /<script src="\.\.\/shared-compare\.js" defer><\/script>\n<script src="\.\.\/compare\.js" defer><\/script>\n<\/body>/);
  assert.equal(index.split('<script>').length - 1, 1, 'only the hashed theme guard runs inline');
  assert.equal((index.match(/<select class="sel" name="p">/g) || []).length, COMPARE_MAX_SLOTS);
  // ai-horde has commercial_ok: null in the dataset; any page with a null flag
  // must say so instead of rendering it as "no".
  const { providers } = JSON.parse(readFileSync(DATA, 'utf8'));
  const page = readdirSync(join(ROOT, 'site/compare')).find((d) => {
    if (!d.includes('-vs-')) return false;
    return d.split('-vs-').some((s) => { const p = providers.find((x) => x.slug === s); return p && p.commercial_ok === null; });
  });
  assert.ok(page, 'the real set contains a provider with an unconfirmed flag');
  assert.match(readFileSync(join(ROOT, `site/compare/${page}/index.html`), 'utf8'), /<span class="tri tri-unk">not confirmed<\/span>/);
});

test('keyboard navigation is client-only: the server-rendered rows carry no tabindex', () => {
  // Without JS there is no key handler, so SSR rows must not add dead tab stops;
  // explorer.js assigns the roving tabindex after it repaints.
  const p = { slug: 'demo', name: 'Demo', category: 'ongoing', verified: true, last_verified: '2026-07-20' };
  assert.doesNotMatch(explorerRowHtml(p, { now: '2026-08-13' }), /tabindex/);
  run(['scripts/build.mjs']);
  const index = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  const tbody = index.slice(index.indexOf('<tbody id="tbody">'), index.indexOf('</tbody>'));
  assert.doesNotMatch(tbody, /tabindex/);
  assert.match(index, /<caption class="sr-only">[^<]*arrow keys move between providers and Enter opens one\.<\/caption>/);
});

test('mobile sort select shows a placeholder for sorts it does not offer', () => {
  // ?sort=notes (or a reversed column) has no matching option; the select must not keep a stale value.
  const index = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  assert.match(index, /<select id="sortSel"[^>]*>\s*<option value="custom" disabled hidden>/);
  const fn = readFileSync(join(ROOT, 'site/explorer.js'), 'utf8').match(/function syncSortSel\(\) \{[\s\S]*?\n\}/)[0];
  const sel = { options: [{ value: 'custom', disabled: true }, { value: 'name:1', disabled: false }], value: 'name:1' };
  const run = (key, dir) => new Function('document', 'sortKey', 'sortDir', fn + '; syncSortSel();')({ getElementById: () => sel }, key, dir);
  run('notes', 1); assert.equal(sel.value, 'custom');
  run('name', 1); assert.equal(sel.value, 'name:1');
  run('name', -1); assert.equal(sel.value, 'custom');
});

test('home: search box, Compare in the menu, and the star count rendered at build', () => {
  run(['scripts/build.mjs']);
  const index = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  assert.match(index, /<input type="search" id="q"[^>]*>/);
  assert.match(index, /<label class="sr-only" for="q">/);
  for (const page of [index, readFileSync(join(ROOT, 'site/compare/index.html'), 'utf8'), readFileSync(join(ROOT, 'site/p/groq.html'), 'utf8')]) {
    const nav = page.slice(page.indexOf('id="primary-nav"'), page.indexOf('</nav>', page.indexOf('id="primary-nav"')));
    assert.match(nav, /href="(\.\.\/)?compare\/"/);
  }
  const { stars } = JSON.parse(readFileSync(join(ROOT, 'data/repo-stats.json'), 'utf8'));
  assert.ok(Number.isInteger(stars));
  const shown = stars.toLocaleString('en-US');
  assert.equal([...index.matchAll(/data-stars>([^<]*)</g)].every((m) => m[1] === shown), true, 'every star slot carries the build-time count');
  const explorer = readFileSync(join(ROOT, 'site/explorer.js'), 'utf8');
  assert.match(explorer, /getElementById\('q'\)\.addEventListener\('input'/);
  assert.match(explorer, /params\.set\('q'/);
});

test('suggested comparisons join one category only; the existing compare pages stay', () => {
  run(['scripts/build.mjs']);
  const providers = JSON.parse(readFileSync(DATA, 'utf8')).providers;
  const bySlug = new Map(providers.map((p) => [p.slug, p]));
  assert.equal(comparisonCategory({ modalities: ['ocr', 'text'] }), 'ocr');
  assert.equal(comparisonCategory({ modalities: [] }), null);
  assert.equal(sameComparisonCategory({ modalities: [] }, { modalities: [] }), false, 'no category is never "the same"');
  const suggested = (html) => [...html.matchAll(/href="(?:\.\.\/)*compare\/([a-z0-9-]+-vs-[a-z0-9-]+)\/"/g)].map((m) => m[1]);
  let links = 0;
  const pages = [join(ROOT, 'site/compare/index.html'), ...readdirSync(join(ROOT, 'site/p')).filter((f) => f.endsWith('.html')).map((f) => join(ROOT, 'site/p', f))];
  for (const file of pages) {
    for (const path of suggested(readFileSync(file, 'utf8'))) {
      const ok = [...path.matchAll(/-vs-/g)].some((m) => {
        const pa = bySlug.get(path.slice(0, m.index)), pb = bySlug.get(path.slice(m.index + 4));
        return pa && pb && sameComparisonCategory(pa, pb);
      });
      assert.ok(ok, `${path} (linked from ${relative(ROOT, file)}) mixes categories`);
      links += 1;
    }
  }
  assert.ok(links > 0, 'some same-category comparisons are still suggested');
  // the pages of the pairs that are no longer suggested are still published
  for (const mixed of ['ocr-space-vs-groq', 'speechify-vs-groq']) {
    assert.ok(existsSync(join(ROOT, `site/compare/${mixed}/index.html`)), `${mixed} page stays`);
  }
});

test('the client makes no GitHub API call and the home search covers model names', () => {
  for (const f of readdirSync(join(ROOT, 'site')).filter((n) => n.endsWith('.js'))) {
    assert.doesNotMatch(readFileSync(join(ROOT, 'site', f), 'utf8'), /api\.github\.com/, `${f} must not call the GitHub API`);
  }
  assert.doesNotMatch(readFileSync(join(ROOT, 'site/index.html'), 'utf8'), /api\.github\.com/);
  const fn = readFileSync(join(ROOT, 'site/explorer.js'), 'utf8').match(/function searchText\(p\) \{[\s\S]*?\n\}/)[0];
  const searchText = new Function(fn + '; return searchText;')();
  assert.ok(searchText({ name: 'Groq', models_free: ['openai/gpt-oss-120b'] }).includes('gpt-oss-120b'));
  const groq = JSON.parse(readFileSync(DATA, 'utf8')).providers.find((p) => p.slug === 'groq');
  assert.ok(searchText(groq).includes(groq.models_free[0].toLowerCase()), 'a real provider is found by one of its models');
});

test('header menu: only Guides & Collections, Compare and The Best (highlighted); Models and API live in the footer', () => {
  run(['scripts/build.mjs']);
  const pages = ['site/index.html', 'site/compare/index.html', 'site/p/groq.html', 'site/models/index.html', 'site/guides-and-collections/index.html'];
  for (const rel of pages) {
    const html = readFileSync(join(ROOT, rel), 'utf8');
    const nav = html.slice(html.indexOf('id="primary-nav"'), html.indexOf('</nav>', html.indexOf('id="primary-nav"')));
    const hrefs = [...nav.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1].replace(/^(\.\.\/)+|^\.\//, ''));
    assert.deepEqual(hrefs, ['guides-and-collections/', 'compare/', 'best/'], `${rel}: the header menu is exactly Guides & Collections, Compare, The Best`);
    assert.match(nav, /<a class="nav-best" href="[^"]*best\/"[^>]*>.*The Best<\/a>/s, `${rel}: The Best carries the highlight class`);
    assert.equal((nav.match(/class="nav-best"/g) || []).length, 1, `${rel}: only one highlighted entry`);
    const footer = html.slice(html.indexOf('<footer'));
    for (const dest of ['models/', 'api/', 'programs/startups', 'programs/research']) assert.ok(footer.includes(dest), `${rel}: footer lacks ${dest}`);
  }
});

test('footer columns: where each link lives, and no GitHub star entry in Project', () => {
  run(['scripts/build.mjs']);
  const expected = {
    Explore: ['#explorer', 'models/', 'guides-and-collections/', 'programs/startups', 'programs/research', 'free-gpu/', 'coding-tools/'],
    Data: ['providers.json', 'api/', 'llms.txt', 'data-policy/', 'coverage/'],
    Project: ['updates', 'changes/', 'state/', 'docs/methodology.md', 'CONTRIBUTING.md', 'agreements/'],
  };
  for (const rel of ['site/index.html', 'site/compare/index.html', 'site/p/groq.html', 'site/legal/privacy.html']) {
    const html = readFileSync(join(ROOT, rel), 'utf8');
    const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));
    const cols = footer.split('<div class="footer-col">').slice(1);
    assert.equal(cols.length, 3, `${rel}: three link columns`);
    for (const colHtml of cols) {
      const col = colHtml.split('</div>')[0];
      const name = col.match(/footer-h">([^<]+)</)[1];
      const hrefs = [...col.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1].replace(/^(\.\.\/)+|^\.\//, '').replace(/^.*\/blob\/main\//, ''));
      assert.deepEqual(hrefs, expected[name], `${rel}: column ${name}`);
    }
    assert.ok(!footer.includes('GitHub ★'), `${rel}: the footer has no "GitHub ★" entry`);
  }
});

test('the privacy page and SECURITY.md say what the star count really does: no GitHub call from the browser', () => {
  run(['scripts/build.mjs']);
  const privacy = readFileSync(join(ROOT, 'site/legal/privacy.html'), 'utf8');
  assert.match(privacy, /read from GitHub's public API by the process that builds the site/);
  assert.doesNotMatch(privacy, /fetched directly from GitHub/);
  // the company name ends with its own full stop: no sentence may add a second one
  for (const page of ['site/legal/privacy.html', 'site/legal/terms.html']) assert.doesNotMatch(readFileSync(join(ROOT, page), 'utf8'), /Inc\.\./, `${page} has a double full stop after the company name`);
  for (const rel of ['site/site.js', 'site/explorer.js', 'site/widget.js']) {
    assert.doesNotMatch(readFileSync(join(ROOT, rel), 'utf8'), /api\.github\.com/, `${rel} must not call the GitHub API: the privacy page says the browser makes no such request`);
  }
  assert.doesNotMatch(readFileSync(join(ROOT, 'SECURITY.md'), 'utf8'), /live GitHub star count/);
});

test('provider sections: honest empty states, numbers only with source and date, no filler', () => {
  const base = { slug: 'x', name: 'X', modalities: ['text'], free_type: 'perpetual', category: 'ongoing' };
  // flags read in words, and "not confirmed" is its own text, not a colour
  const reqs = requirementsHtml({ ...base, card_required: null, phone_required: false, commercial_ok: true });
  assert.match(reqs, /Credit card<\/dt><dd><span class="tri tri-unk">not confirmed<\/span>/);
  assert.match(reqs, /Phone verification<\/dt><dd><span class="tri tri-no">not required<\/span>/);
  assert.match(reqs, /Commercial use<\/dt><dd><span class="tri tri-yes">allowed<\/span>/);
  // limits: numbers appear with their source and reading date; without them one honest line
  const withNumbers = limitsHtml({ ...base, rate_limits: '30 RPM', free_limits: { requests_per_minute: 30, requests_per_day: 14400, scope: 'free plan', source: 'https://example.com/limits', checked: '2026-10-08' } });
  assert.match(withNumbers, /<th scope="row">requests per minute<\/th><td>30<\/td>/);
  assert.match(withNumbers, /14,400/);
  assert.match(withNumbers, /href="https:\/\/example\.com\/limits"[^>]*>the provider's page<\/a>, read 2026-10-08/);
  const without = limitsHtml({ ...base, rate_limits: 'Not published' });
  assert.doesNotMatch(without, /<table/);
  assert.match(without, /Numeric limits are not recorded in structured form/);
  assert.doesNotMatch(limitsHtml({ ...base, free_limits: { requests_per_day: 5, scope: 's', source: 'javascript:alert(1)', checked: '2026-10-08' } }), /javascript:/, 'a non-http source never becomes a link');
  // numbers without an http(s) source or a read date are not shown at all
  for (const bad of [{ source: 'javascript:alert(1)', checked: '2026-10-08' }, { source: 'https://example.com/x', checked: '' }, { checked: '2026-10-08' }]) {
    const out = limitsHtml({ ...base, free_limits: { requests_per_day: 5, scope: 's', ...bad } });
    assert.doesNotMatch(out, /<table/, `no table for ${JSON.stringify(bad)}`);
    assert.match(out, /Numeric limits are not recorded in structured form/);
  }
  // Expires: an ongoing free tier with no end date reads "no expiry"; a trial credit with none is "not confirmed"
  assert.match(glanceHtml({ ...base, expires: null }, 'Ongoing'), /Expires<\/span><span class="meta-v">no expiry/);
  assert.match(glanceHtml({ ...base, free_type: 'trial-credit', category: 'trial', expires: null }, 'Trial'), /Expires<\/span><span class="meta-v"><span class="tri tri-unk">not confirmed<\/span>/);
  assert.match(glanceHtml({ ...base, free_type: 'trial-credit', category: 'trial', expires: '2026-12-31' }, 'Trial'), /Expires<\/span><span class="meta-v">2026-12-31/);
  // models: one line when none are listed, a section when they are
  assert.match(modelsHtml(base), /Free models: not listed yet\./);
  assert.doesNotMatch(modelsHtml(base), /<h2/);
  assert.match(modelsHtml({ ...base, models_free: ['a/b'] }), /<h2 id="models">Free models/);
  // data policy: the slot for REPO-064 is empty until a provider has the field
  assert.equal(dataPolicyHtml(base), '');
  const dp = dataPolicyHtml({ ...base, data_policy: { trains_on_prompts: false, retention: '30 days', source: 'https://example.com/p' } });
  assert.match(dp, /<h2 id="data-policy">Data policy<\/h2>/);
  assert.match(dp, /Trains on your prompts<\/dt><dd><span class="tri tri-no">no<\/span>/);
  assert.match(dp, /30 days/);
});

test('every provider page has the same sections in the same order, unnumbered, with a valid heading order', () => {
  run(['scripts/build.mjs']);
  const order = ['whats-free', 'limits'];
  const providersBySlug = new Map(JSON.parse(readFileSync(DATA, 'utf8')).providers.map((q) => [q.slug, q]));
  for (const f of readdirSync(join(ROOT, 'site/p')).filter((n) => n.endsWith('.html'))) {
    const html = readFileSync(join(ROOT, 'site/p', f), 'utf8');
    const main = html.slice(html.indexOf('<main id="main">'));
    let at = -1;
    for (const id of order) { const i = main.indexOf(`id="${id}"`); assert.ok(i > at, `${f}: #${id} missing or out of order`); at = i; }
    assert.match(main, /class="wrap prose prov-prose"/, `${f}: unnumbered prose wrapper`);
    assert.match(main, /class="prov-reqs"/, `${f}: requirement flags present`);
    const prov = providersBySlug.get(f.replace(/[.]html$/, ''));
    if (prov && prov.data_policy) assert.match(main, /<h2 id="data-policy">/, `${f}: a provider with data_policy shows it`);
    else assert.doesNotMatch(main, /Data policy/, `${f}: no data-policy filler without the field`);
    const levels = [...html.matchAll(/<h([1-6])[ >]/g)].map((m) => +m[1]);
    for (let i = 1; i < levels.length; i += 1) assert.ok(levels[i] <= levels[i - 1] + 1, `${f}: heading level jumps from h${levels[i - 1]} to h${levels[i]}`);
    if (/class="[^"]*\bbtn primary\b/.test(html) && /Quickstart|Get started/.test(main)) assert.match(main, /<h2 id="quickstart">/, `${f}: the #quickstart anchor stays`);
    assert.doesNotMatch(main, /https:\/\/&lt;api-base-url&gt;|https:\/\/\//, `${f}: no invented endpoint in a sample`);
  }
});

test('real pages: a trial credit without an end date says "not confirmed", an ongoing free tier says "no expiry"', () => {
  run(['scripts/build.mjs']);
  const { providers } = JSON.parse(readFileSync(DATA, 'utf8'));
  const trial = providers.find((p) => p.free_type === 'trial-credit' && !p.expires);
  const ongoing = providers.find((p) => p.free_type !== 'trial-credit' && !p.expires);
  assert.ok(trial && ongoing, 'the real data has both cases');
  const expiresCell = (slug) => readFileSync(join(ROOT, 'site/p', `${slug}.html`), 'utf8').match(/Expires<\/span><span class="meta-v">([\s\S]*?)<\/span>(?:<\/span>)?<\/div>/)[1];
  assert.match(expiresCell(trial.slug), /not confirmed/, `${trial.slug}: trial credit without expires`);
  assert.match(expiresCell(ongoing.slug), /no expiry/, `${ongoing.slug}: ongoing free tier without expires`);
  const known = providers.find((p) => p.expires);
  if (known) assert.ok(readFileSync(join(ROOT, 'site/p', `${known.slug}.html`), 'utf8').includes(known.expires), 'a recorded end date is still shown');
});

test('no_expiry: the validator accepts a sourced statement on a trial credit and rejects the rest', () => {
  const good = { source: 'https://example.com/pricing', checked: '2026-10-09', quote: 'Credits never expire.' };
  const trial = (d) => d.providers.find((p) => p.free_type === 'trial-credit' && !p.expires);
  const ongoing = (d) => d.providers.find((p) => p.free_type !== 'trial-credit');
  assert.equal(validateAfter((d) => { trial(d).no_expiry = { ...good }; }), true, 'a sourced statement on a trial credit passes');
  assert.equal(validateAfter((d) => { ongoing(d).no_expiry = { ...good }; }), false, 'not on a continuous free tier');
  assert.equal(validateAfter((d) => { const t = d.providers.find((p) => p.free_type === 'recurring-credit'); t.no_expiry = { ...good }; }), false, 'not on a recurring credit');
  assert.equal(validateAfter((d) => { const t = d.providers.find((p) => p.free_type === 'trial-credit' && p.expires); t.no_expiry = { ...good }; }), false, 'not together with a non-null expires');
  for (const bad of [{ source: 'javascript:alert(1)' }, { source: '' }, { checked: '2999-01-01' }, { checked: 'yesterday' }, { quote: '' }, { quote: 'x'.repeat(301) }, { extra: 1 }]) {
    assert.equal(validateAfter((d) => { trial(d).no_expiry = { ...good, ...bad }; }), false, `rejected: ${JSON.stringify(bad).slice(0, 40)}`);
  }
  assert.equal(validateAfter((d) => { const t = trial(d); t.no_expiry = { ...good }; delete t.no_expiry.quote; }), false, 'the quote is required');
});

test('data_policy: the validator accepts a sourced statement and rejects the rest', () => {
  const good = { trains_on_prompts: false, retention: '30 days', source: 'https://example.com/privacy', checked: '2026-10-09' };
  const one = (d) => d.providers[0];
  assert.equal(validateAfter((d) => { one(d).data_policy = { ...good }; }), true, 'a sourced statement passes');
  assert.equal(validateAfter((d) => { one(d).data_policy = { ...good, retention: null }; }), true, 'one stated part is enough');
  assert.equal(validateAfter((d) => { one(d).data_policy = { ...good, trains_on_prompts: null }; }), true, 'retention alone is enough');
  assert.equal(validateAfter((d) => { one(d).data_policy = null; }), true, 'null means nobody recorded it');
  assert.equal(validateAfter((d) => { one(d).data_policy = { ...good, trains_on_prompts: null, retention: null }; }), false, 'an all-null policy records nothing');
  for (const bad of [{ source: 'javascript:alert(1)' }, { source: '' }, { checked: '2999-01-01' }, { checked: 'yesterday' }, { retention: '' }, { retention: 'x'.repeat(121) }, { trains_on_prompts: 'no' }, { extra: 1 }]) {
    assert.equal(validateAfter((d) => { one(d).data_policy = { ...good, ...bad }; }), false, `rejected: ${JSON.stringify(bad).slice(0, 40)}`);
  }
  assert.equal(validateAfter((d) => { const dp = { ...good }; delete dp.source; one(d).data_policy = dp; }), false, 'the source is required');
  assert.equal(validateAfter((d) => { const dp = { ...good }; delete dp.checked; one(d).data_policy = dp; }), false, 'the day it was read is required');
});

test('data_policy: a provider that has it shows the section on its page, and the serializer keeps it', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  data.providers[0].data_policy = { trains_on_prompts: true, retention: '30 days', source: 'https://example.com/privacy', checked: data.generated };
  assert.equal(roundTripError(serialize(data)), null, 'the serializer round-trips the field');
  assert.ok(serialize(data).includes('"data_policy"'), 'the serializer writes it');
  const html = dataPolicyHtml(data.providers[0]);
  assert.match(html, /Trains on your prompts<\/dt><dd><span class="tri tri-yes">yes<\/span>/);
  assert.match(html, /30 days/);
  assert.match(html, /href="https:\/\/example\.com\/privacy"/);
});

test('expiry reads the same on the provider page, the comparison and the API', () => {
  run(['scripts/build.mjs']);
  const { providers } = JSON.parse(readFileSync(DATA, 'utf8'));
  const by = (slug) => providers.find((p) => p.slug === slug);
  const pageCell = (slug) => readFileSync(join(ROOT, 'site/p', `${slug}.html`), 'utf8').match(/Expires<\/span><span class="meta-v">([\s\S]*?)<\/div>/)[1];
  const compareCell = (p, q) => compareTableHtml([p, q]).match(new RegExp(`Expires[\\s\\S]*?</tr>`))[0];
  const api = JSON.parse(readFileSync(join(ROOT, 'site/api/v1/providers.json'), 'utf8')).providers;
  // a trial credit whose provider says it never expires, a trial credit nobody has spoken for, and a continuous free tier
  const never = by('deepgram'), unknown = by('scaleway'), ongoing = by('groq');
  assert.ok(never.no_expiry && !unknown.no_expiry && !unknown.expires && ongoing.free_type !== 'trial-credit');
  assert.match(pageCell('deepgram'), new RegExp(`no expiry[\\s\\S]*per the provider[\\s\\S]*read ${never.no_expiry.checked}`));
  assert.match(compareCell(never, ongoing), /no expiry[\s\S]*per the provider/);
  assert.ok(api.find((p) => p.slug === 'deepgram').no_expiry, 'the API carries the field');
  assert.match(pageCell('scaleway'), /not confirmed/);
  assert.match(compareCell(unknown, ongoing), /not confirmed/, 'a trial credit with no data is no longer "no expiry" in comparisons');
  assert.equal(api.find((p) => p.slug === 'scaleway').no_expiry, undefined);
  assert.match(pageCell('groq'), /^no expiry<\/span>$/);
});

// ---------- weekly re-verification pacing (lib/pacing.mjs) ----------
// Simulate doing exactly the proposed batch every week and check the two
// promises the worklist makes: nothing goes overdue, and a same-day cohort
// is spread out instead of expiring in one week.

function simulateWorklist(ages, weeks) {
  let entries = ages.map((age, id) => ({ id, age }));
  let worstAge = 0;
  const redoneByWeek = [];
  for (let w = 0; w < weeks; w++) {
    const { size } = weeklyPacing(entries.map((e) => e.age), SLA_DAYS);
    const batch = weeklyBatch(entries, (e) => e.age, SLA_DAYS, size);
    redoneByWeek.push(batch.length);
    for (const e of batch) e.age = 0;
    for (const e of entries) e.age += 7;
    worstAge = Math.max(worstAge, ...entries.map((e) => e.age));
  }
  return { worstAge, redoneByWeek, entries };
}

test('pacing: a 64-entry same-day cohort never goes overdue and is spread out', () => {
  const ages = [...Array(64).fill(0), 56, 55, 6];
  const { worstAge, redoneByWeek } = simulateWorklist(ages, 40);
  assert.ok(worstAge <= SLA_DAYS, `worst age ${worstAge} must stay within the ${SLA_DAYS}-day SLA`);
  assert.ok(Math.max(...redoneByWeek) <= WEEKLY_CAP, 'no week asks for more than the cap');
  // After a full cycle, no single week carries more than a cap's worth of expiries.
  const { entries } = simulateWorklist(ages, 26);
  const perAge = {};
  for (const e of entries) perAge[e.age] = (perAge[e.age] || 0) + 1;
  assert.ok(Math.max(...Object.values(perAge)) <= WEEKLY_CAP, 'the cohort no longer shares one verification week');
});

test('pacing: entries younger than the minimum age are not proposed', () => {
  const ages = [...Array(20).fill(5), 40, 50];
  const { size } = weeklyPacing(ages, SLA_DAYS);
  const batch = weeklyBatch(ages.map((age) => ({ age })), (e) => e.age, SLA_DAYS, size);
  assert.ok(batch.every((e) => e.age >= MIN_AGE_DAYS));
});

test('pacing: entries about to cross the SLA are always proposed first', () => {
  const ages = [88, 10, 10, 10];
  const batch = weeklyBatch(ages.map((age) => ({ age })), (e) => e.age, SLA_DAYS, 1);
  assert.equal(batch[0].age, 88);
});

test('pacing: when even the cap cannot keep the SLA, it says so', () => {
  const result = weeklyPacing(Array(68).fill(85), SLA_DAYS);
  assert.equal(result.capped, true);
  assert.equal(result.size, WEEKLY_CAP);
});

test('validate rejects a category that contradicts free_type', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  const p = data.providers.find((x) => x.free_type === 'trial-credit');
  p.category = 'ongoing';
  const fixture = tmpFile('providers.json');
  writeFileSync(fixture, JSON.stringify(data));
  assert.equal(exitOk(['scripts/validate.mjs', fixture]), false);
});

// ---------- score inputs: is_text_llm, model_tier, free_limits ----------
import { tierForRating, nearBoundary, MODEL_TIER_THRESHOLDS, MODEL_TIER_MIN_VOTES, MODEL_TIER_BOUNDARY_MARGIN } from './lib/model-tier.mjs';

// Runs validate.mjs on a mutated copy of the dataset (removed when the process exits).
const validateAfter = (mutate) => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  mutate(data);
  const fixture = tmpFile('providers.json');
  writeFileSync(fixture, JSON.stringify(data));
  return exitOk(['scripts/validate.mjs', fixture]);
};

// A `generated` after today in UTC is what a contributor in a time zone ahead of UTC writes at the end of their day (2026-10-16 when it is still
// 2026-10-15 in UTC). It must fail, with the way to write the day.
test('validate: the dates of the dataset are UTC days and none is in the future', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  const withToday = (today, file = DATA) => { try { execFileSync(process.execPath, ['scripts/validate.mjs', file], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, VALIDATE_TODAY: today } }); return ''; } catch (e) { return `${e.stdout}${e.stderr}`; } };
  assert.equal(withToday(data.generated), '', 'generated is today: valid');
  assert.equal(withToday('2999-01-01'), '', 'generated in the past: valid');
  const day = new Date(Date.parse(`${data.generated}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  assert.match(withToday(day), new RegExp(`generated \\(${data.generated}\\) is after today in UTC \\(${day}\\); write the dates of the dataset in UTC`), 'generated the day after "today" fails and says how to write it');
  assert.equal(validateAfter((d) => { d.generated = '2999-01-01'; }), false, 'with the real clock, a generated far in the future fails');
  const later = tmpFile('providers.json'); writeFileSync(later, JSON.stringify({ ...data, generated: '2026-10-16' }));
  assert.match(withToday('2026-10-15', later), /after today in UTC \(2026-10-15\)/, 'the contributor in Asia: 2026-10-16 when it is 2026-10-15 in UTC');
  assert.match(readFileSync(join(ROOT, 'CONTRIBUTING.md'), 'utf8'), /Dates are UTC days/, 'CONTRIBUTING says it');
});

test('model tier thresholds: edges, tier 0 versus no source, and the minimum votes', () => {
  assert.deepEqual(MODEL_TIER_THRESHOLDS, [[4, 1450], [3, 1400], [2, 1330], [1, 1250]]);
  assert.equal(tierForRating(1450), 4);
  assert.equal(tierForRating(1449.9), 3);
  assert.equal(tierForRating(1400), 3);
  assert.equal(tierForRating(1330), 2);
  assert.equal(tierForRating(1250), 1);
  assert.equal(tierForRating(1249.9), 0, 'sourced and below the lowest threshold is tier 0');
  assert.equal(tierForRating(null), null, 'no rating is no tier, never 0');
  assert.equal(tierForRating(Number.NaN), null);
  assert.equal(MODEL_TIER_MIN_VOTES, 1000);
});

test('boundary: an interval that crosses or comes within the margin of a threshold is flagged', () => {
  assert.equal(MODEL_TIER_BOUNDARY_MARGIN, 5);
  assert.equal(nearBoundary([1445.4, 1460.3]), true, 'crosses 1450');
  assert.equal(nearBoundary([1332.2, 1351.3]), true, '2.2 points above 1330');
  assert.equal(nearBoundary([1432.3, 1443.1]), false, '6.9 below 1450 and far from 1400');
  assert.equal(nearBoundary([1337, 1351]), false, '7 points above 1330');
  assert.equal(nearBoundary(null), false);
  assert.equal(nearBoundary([1, 'x']), false);
});

test('every provider states is_text_llm; a tier always matches its cited rating and never sits on a trial credit', () => {
  const { providers } = JSON.parse(readFileSync(DATA, 'utf8'));
  for (const p of providers) {
    assert.equal(typeof p.is_text_llm, 'boolean', `${p.slug}: is_text_llm is explicit`);
    if (p.model_tier != null) {
      assert.equal(p.model_tier, tierForRating(p.model_tier_source.rating), `${p.slug}: tier follows the rating`);
      assert.ok(p.model_tier_source.votes >= MODEL_TIER_MIN_VOTES, `${p.slug}: enough votes`);
      assert.equal(p.is_text_llm, true, `${p.slug}: only text-LLM offers carry a tier`);
      assert.notEqual(p.free_type, 'trial-credit', `${p.slug}: a trial credit is not continuous free access`);
    } else {
      assert.ok(!('model_tier_source' in p) || p.model_tier_source === null, `${p.slug}: no tier, no source`);
    }
    if (p.free_limits) assert.notEqual(p.free_type, 'trial-credit', `${p.slug}: no free_limits on a trial credit`);
  }
  assert.ok(providers.some((p) => p.model_tier != null), 'the dataset has rated providers');
});

test('validate rejects a tier that disagrees with its rating, a tier without a source and a missing is_text_llm', () => {
  const rated = (d) => d.providers.find((p) => p.model_tier != null);
  assert.equal(validateAfter((d) => { rated(d).model_tier = (rated(d).model_tier + 1) % 5; }), false);
  assert.equal(validateAfter((d) => { delete rated(d).model_tier_source; }), false);
  assert.equal(validateAfter((d) => { delete d.providers[0].is_text_llm; }), false);
  assert.equal(validateAfter((d) => { const p = rated(d); p.model_tier_source.votes = 999; }), false);
  assert.equal(validateAfter((d) => { const p = d.providers.find((x) => x.model_tier_source?.boundary); delete p.model_tier_source.boundary; }), false, 'a boundary the interval implies cannot be omitted');
  assert.equal(validateAfter((d) => { const p = d.providers.find((x) => x.model_tier_source && !x.model_tier_source.boundary); p.model_tier_source.boundary = true; }), false, 'nor invented');
  assert.equal(validateAfter(() => {}), true, 'the unmodified dataset passes through the same path');
});

test('validate rejects free_limits on a trial credit or without a source', () => {
  assert.equal(validateAfter((d) => { const p = d.providers.find((x) => x.free_type === 'trial-credit'); p.free_limits = { requests_per_day: 10, source: 'https://example.invalid/limits', checked: d.generated }; }), false);
  assert.equal(validateAfter((d) => { const p = d.providers.find((x) => x.free_limits); delete p.free_limits.source; }), false);
  assert.equal(validateAfter((d) => { const p = d.providers.find((x) => x.free_limits); p.free_limits.requests_per_day = 1.5; }), false);
});

// ---------- provider counts derived from the data ----------
import { providerFigures, expandFigures, injectInlineFigures, figureErrors } from './lib/figures.mjs';

const walkHtml = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walkHtml(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []);
// Removes every open..close block with string search. A single regex pass leaves
// fragments behind on nested or malformed input (CodeQL js/bad-tag-filter), and
// each removal here shortens the string, so the loop always ends.
const dropBlocks = (html, open, close) => {
  let out = html;
  for (let i = out.indexOf(open); i !== -1; i = out.indexOf(open)) {
    const j = out.indexOf(close, i + open.length);
    out = out.slice(0, i) + (j === -1 ? '' : out.slice(j + close.length));
  }
  return out;
};
const builtPages = () => { run(['scripts/build.mjs']); return walkHtml(join(ROOT, 'site')); };

test('figures: tokens and FIG markers take the number from the data', () => {
  const figs = providerFigures([{ verified: true }, { verified: true }, { verified: false }]);
  assert.deepEqual(figs, { providers: 3, verified: 2 });
  assert.equal(expandFigures('{verified} of {providers}', figs), '2 of 3');
  assert.equal(injectInlineFigures('all <!-- FIG:providers -->99<!-- /FIG --> providers', figs), 'all <!-- FIG:providers -->3<!-- /FIG --> providers');
});

test('figures: a typed count that disagrees with the data is reported, one that matches is not', () => {
  const figs = { providers: 68, verified: 67 };
  assert.equal(figureErrors('the 69 verified providers', figs, 'x').length, 1);
  assert.equal(figureErrors('all 69 providers', figs, 'x').length, 1);
  assert.deepEqual(figureErrors('the 67 verified providers and all 68 providers', figs, 'x'), []);
  assert.deepEqual(figureErrors('a <!-- FIG:verified -->12<!-- /FIG --> verified providers marker', figs, 'x'), []);
  assert.deepEqual(figureErrors('expected >10 providers in the mined history', figs, 'x'), []);
  assert.equal(figureErrors('13/67 providers on real data', figs, 'x').length, 0, 'a verified-count denominator is fine');
  assert.equal(figureErrors('13/70 providers on real data', figs, 'x').length, 1);
});

test('no source or generated page states a provider count that differs from providers.json', () => {
  const figs = providerFigures(JSON.parse(readFileSync(DATA, 'utf8')).providers);
  // updates/, changes/ and state/ quote git history (old commit subjects), not the dataset
  const files = ['README.md', 'data/best.json', ...builtPages().map((f) => f.slice(ROOT.length + 1))
    .filter((rel) => !/^site\/(updates|changes|state)(\/|\.html$)/.test(rel))];
  const errs = files.flatMap((rel) => figureErrors(readFileSync(join(ROOT, rel), 'utf8'), figs, rel));
  assert.deepEqual(errs, []);
  const best = readFileSync(join(ROOT, 'site/best/index.html'), 'utf8');
  assert.match(best, new RegExp(`from the ${figs.verified} verified providers`));
});

test('version is described the same way everywhere: the dataset release, not a schema version', () => {
  const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
  run(['scripts/build.mjs']);
  const claimsSchemaVersion = /dataset schema version|schema v\d|dataset schema\b/i;
  const sources = {
    'data/schema.json': JSON.parse(read('data/schema.json')).properties.version.description,
    'docs/api.md': read('docs/api.md').split('\n').find((l) => l.startsWith('- **`version`**')),
    'CHANGELOG.md (intro)': read('CHANGELOG.md').split('\n').slice(0, 8).join('\n'),
    'site/llms.txt': read('site/llms.txt'),
    'site/llms-full.txt': read('site/llms-full.txt'),
  };
  for (const [name, text] of Object.entries(sources)) {
    assert.ok(text, `${name}: has a description of version`);
    assert.doesNotMatch(text, claimsSchemaVersion, `${name} calls version a schema version`);
  }
  assert.match(sources['docs/api.md'], /release version/);
  assert.match(sources['data/schema.json'], /release version/);
});

// ---------- canonicals, sitemap and /programs/ (public SEO errors) ----------
test('every page declares an absolute canonical URL', () => {
  for (const f of builtPages()) {
    const html = readFileSync(f, 'utf8');
    const m = html.match(/<link rel="canonical" href="([^"]*)"/);
    if (!m) continue; // 404.html and the like declare none
    assert.match(m[1], /^https:\/\/freellmapihub\.com\//, `${f.slice(ROOT.length + 1)}: canonical "${m[1]}" is not absolute`);
  }
});

test('every page meta description fits a search snippet (<= 155 characters)', () => {
  const unescape = (t) => t.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  let seen = 0;
  for (const f of builtPages()) {
    const m = readFileSync(f, 'utf8').match(/<meta name="description" content="([^"]*)"/);
    if (!m) continue;
    seen += 1;
    const n = [...unescape(m[1])].length;
    assert.ok(n <= 155, `${f.slice(ROOT.length + 1)}: description is ${n} characters`);
  }
  assert.ok(seen > 100, 'the check reached the generated pages');
});

test('internal links in the built site resolve to a page (no 404)', () => {
  const siteDir = join(ROOT, 'site');
  const exists = (urlPath) => {
    const rel = decodeURIComponent(urlPath).replace(/^\//, '');
    return [rel, rel + '.html', rel.replace(/\/?$/, '/') + 'index.html', ...(rel === '' ? ['index.html'] : [])]
      .some((c) => existsSync(join(siteDir, c)) && statSync(join(siteDir, c)).isFile());
  };
  const broken = [];
  let checked = 0;
  for (const f of builtPages()) {
    const rel = f.slice(siteDir.length + 1);
    const pagePath = '/' + (rel.endsWith('index.html') ? rel.slice(0, -'index.html'.length) : rel.replace(/\.html$/, ''));
    const html = dropBlocks(dropBlocks(readFileSync(f, 'utf8'), '<script', '</script>'), '<!--', '-->');
    for (const m of html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
      const href = m[1];
      if (/^(https?:|mailto:|tel:|javascript:|#|data:)/.test(href)) continue;
      const url = new URL(href, 'https://freellmapihub.com' + pagePath);
      checked += 1;
      if (!exists(url.pathname)) broken.push(`${rel} -> ${href}`);
    }
  }
  assert.ok(checked > 1000, `the check reached the links (${checked})`);
  assert.deepEqual(broken, [], 'internal links that resolve to no page');
});

test('/programs/ resolves to a page that links both program pages', () => {
  builtPages();
  const html = readFileSync(join(ROOT, 'site/programs/index.html'), 'utf8');
  assert.match(html, /href="startups"/);
  assert.match(html, /href="research"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/freellmapihub\.com\/programs\/">/);
});

test('sitemap lists every indexable page except the deliberately omitted ones, with a data-derived lastmod', () => {
  const pages = builtPages();
  const sitemap = readFileSync(join(ROOT, 'site/sitemap.xml'), 'utf8');
  const listed = new Set([...sitemap.matchAll(/<loc>https:\/\/freellmapihub\.com\/([^<]*)<\/loc>/g)].map((m) => m[1]));
  const missing = [];
  for (const f of pages) {
    const rel = f.slice(join(ROOT, 'site').length + 1);
    if (rel === '404.html' || rel.startsWith('updates/page/') || /^state\/\d{4}-\d{2}\//.test(rel)) continue; // 404 is not a page; pagination follows the commit count (test above)
    const html = readFileSync(f, 'utf8');
    if (/<meta name="robots" content="noindex">/.test(html)) continue; // redirect stubs and legal pages
    const path = rel === 'index.html' ? '' : rel.replace(/index\.html$/, '').replace(/\.html$/, '');
    if (!listed.has(path)) missing.push(path || '/');
  }
  assert.deepEqual(missing, [], 'indexable pages missing from sitemap.xml');
  const dates = new Set([...sitemap.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map((m) => m[1]));
  assert.ok(dates.size > 1, 'lastmod must follow the data, not stamp every page with one build date');
  const gen = JSON.parse(readFileSync(DATA, 'utf8'));
  const p = gen.providers[0];
  assert.match(sitemap, new RegExp(`/p/${p.slug}</loc><lastmod>${p.last_verified}</lastmod>`));
  // the monthly reports live in their own git-derived sitemap, advertised from robots.txt
  const stateMap = readFileSync(join(ROOT, 'site/sitemap-state.xml'), 'utf8');
  for (const m of readdirSync(join(ROOT, 'site/state')).filter((f) => /^\d{4}-\d{2}$/.test(f))) {
    assert.match(stateMap, new RegExp(`<loc>https://freellmapihub\\.com/state/${m}/</loc>`), `state/${m} missing from sitemap-state.xml`);
  }
  assert.match(readFileSync(join(ROOT, 'site/robots.txt'), 'utf8'), /^Sitemap: https:\/\/freellmapihub\.com\/sitemap-state\.xml$/m);
});

test('the live state-sitemap check accepts a well-formed file and names every defect', async () => {
  const { stateSitemapProblems } = await import('./lib/state-sitemap.mjs');
  const site = 'https://freellmapihub.com';
  const ok = `<urlset xmlns="x"><url><loc>${site}/state/2026-10/</loc></url></urlset>`;
  const robots = `Sitemap: ${site}/sitemap.xml\nSitemap: ${site}/sitemap-state.xml\n`;
  assert.deepEqual(stateSitemapProblems(ok, robots, site).problems, []);
  assert.equal(stateSitemapProblems('<urlset></urlset>', robots, site).problems.length, 1);
  assert.equal(stateSitemapProblems(ok.replace('/state/2026-10/', '/p/groq'), robots, site).problems.length, 1);
  assert.equal(stateSitemapProblems(ok, `Sitemap: ${site}/sitemap.xml\n`, site).problems.length, 1);
});

test('temporary directories are created only through scripts/lib/tmp.mjs', () => {
  const needle = ['mkdtemp', 'Sync'].join('');
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.mjs') && path !== join(ROOT, 'scripts/lib/tmp.mjs') && readFileSync(path, 'utf8').includes(needle)) offenders.push(path);
    }
  };
  walk(join(ROOT, 'scripts'));
  assert.deepEqual(offenders, []);
});

test('the narrow-screen rules that keep the pages from scrolling sideways stay in the stylesheet', () => {
  // Measured with a browser at 360, 390, 768, 860 and 1280 px (page scrollWidth equals the viewport).
  // A browser is not part of this suite, so the rules that fixed it are pinned by text.
  const css = readFileSync(join(ROOT, 'site/styles.css'), 'utf8').replace(/\s+/g, ' ');
  assert.match(css, /@media \(max-width: 720px\) \{ #table td:nth-child\(1\) \{ width: 100%; \}/);
  assert.match(css, /#table td \{ min-width: 0; overflow-wrap: anywhere; \}/);
  assert.match(css, /@media \(min-width: 721px\) and \(max-width: 1000px\) \{ #table thead th \{ white-space: normal;/);
  assert.match(css, /\.model-table th, \.model-table td \{ overflow-wrap: anywhere; \}/);
  assert.match(css, /@media \(max-width: 480px\) \{ \.model-table th, \.model-table td \{ padding-left: 6px;/);
});

test('the stat tiles keep a reserved height, so filling them in does not push the page down', () => {
  // explorer.js writes the tiles after load; Lighthouse on a phone measured a 0.068 shift without the reserved
  // height and 0 with it (desktop 0.032 and 0). The block is empty in the HTML, so the height lives in the CSS.
  const html = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  assert.match(html, /<div class="stats" id="stats"[^>]*><\/div>/);
  const css = readFileSync(join(ROOT, 'site/styles.css'), 'utf8').replace(/\s+/g, ' ');
  assert.match(css, /@media \(scripting: enabled\) \{ \.stats \{ min-height: 157px; \} \}/);
  assert.match(css, /@media \(scripting: enabled\) and \(max-width: 640px\) \{ \.stats \{ min-height: 288px; \} \}/);
  assert.match(css, /@media \(scripting: enabled\) and \(max-width: 479px\) \{ \.stats \{ min-height: 308px; \} \}/);
  // Not reserved without scripts: the block would be an empty gap when explorer.js never runs.
  assert.doesNotMatch(css, /\.stats \{ display: grid;[^}]*min-height/);
});

test('long strings in provider notes wrap instead of widening the page on a phone', () => {
  // Measured with a browser: 7 of the 68 provider pages were wider than a 360px screen (a long URL in a note); with
  // this rule none is, at 360 and 390px. The rule is pinned by text because a browser is not part of the suite.
  const css = readFileSync(join(ROOT, 'site/styles.css'), 'utf8').replace(/\s+/g, ' ');
  assert.match(css, /\.prov-card p, p\.muted \{ overflow-wrap: anywhere; \}/);
});

test('the /compare/ tables show the score and the model quality tier, in the static pages and the browser bundle', () => {
  run(['scripts/build.mjs']);
  const scores = JSON.parse(readFileSync(join(ROOT, 'site/scores.json'), 'utf8')).scores;
  const dir = readdirSync(join(ROOT, 'site/compare')).find((d) => d.includes('-vs-'));
  const page = readFileSync(join(ROOT, 'site/compare', dir, 'index.html'), 'utf8');
  assert.match(page, /<th scope="row">Score<\/th>/);
  assert.match(page, /<th scope="row">Model quality tier<\/th>/);
  const [a, b] = dir.split('-vs-');
  for (const slug of [a, b]) {
    const sc = scores[slug];
    if (sc) assert.ok(page.includes(`<strong>${sc.total.toFixed(1)}</strong> / 100`), `${slug}: the page shows its score`);
  }
  // the browser view runs the same function: with scores it adds the rows, without them the table is unchanged
  const bundle = readFileSync(join(ROOT, 'site/shared-compare.js'), 'utf8');
  assert.match(bundle, /Model quality tier/);
  const { compareTableHtml } = (new Function('window', bundle + '; return window.FLLM_COMPARE;'))({});
  const p = JSON.parse(readFileSync(DATA, 'utf8')).providers[0];
  assert.doesNotMatch(compareTableHtml([p, p]), /Model quality tier/);
  assert.match(compareTableHtml([p, p], { scores: { [p.slug]: { total: 51.25, confirmed: 4, of: 6, rank: 2 } } }), /<strong>51\.3<\/strong> \/ 100[\s\S]*4 of 6 inputs confirmed · <a href="best\/">#2 in the top 10<\/a>/);
});

// ---------- /coverage/ — the data-coverage task board ----------
import { coverageMainHtml, coverage as coverageOf } from './lib/coverage.mjs';

// A separate path from lib/coverage.mjs on purpose: plain loops and the populations as the card words them.
const coverageByHand = (providers) => {
  const out = {};
  const add = (key, inPop, has) => {
    let total = 0; let confirmed = 0;
    for (const p of providers) {
      if (!inPop(p)) continue;
      total += 1;
      if (has(p)) confirmed += 1;
    }
    out[key] = { total, confirmed, open: total - confirmed };
  };
  const verified = (p) => p.verified === true;
  const verifiedText = (p) => p.verified === true && p.is_text_llm === true;
  const verifiedTextNotTrial = (p) => verifiedText(p) && p.free_type !== 'trial-credit';
  add('card_required', verified, (p) => p.card_required === true || p.card_required === false);
  add('phone_required', verified, (p) => p.phone_required === true || p.phone_required === false);
  add('commercial_ok', verified, (p) => p.commercial_ok === true || p.commercial_ok === false);
  add('openai_compatible', verified, (p) => p.openai_compatible === true || p.openai_compatible === false);
  add('model_tier', verifiedTextNotTrial, (p) => typeof p.model_tier === 'number');
  add('free_limits', verifiedTextNotTrial, (p) => p.free_limits !== null && p.free_limits !== undefined);
  add('models_free', verifiedText, (p) => Array.isArray(p.models_free) && p.models_free.length > 0);
  add('data_policy', verifiedText, (p) => p.data_policy !== null && p.data_policy !== undefined);
  return out;
};

test('/coverage/ shows, for every field, counts that match a separate recount from the data', () => {
  run(['scripts/build.mjs']);
  const { providers } = JSON.parse(readFileSync(DATA, 'utf8'));
  const html = readFileSync(join(ROOT, 'site/coverage/index.html'), 'utf8');
  const expected = coverageByHand(providers);
  const labels = {
    card_required: 'Credit card required?', phone_required: 'Phone verification required?', commercial_ok: 'Commercial use allowed?',
    openai_compatible: 'OpenAI-compatible endpoint?', model_tier: 'Model quality tier', free_limits: 'Published free limits',
    models_free: 'Free model sample', data_policy: 'Data policy',
  };
  for (const [key, e] of Object.entries(expected)) {
    const m = html.match(new RegExp('<span class="cov-label">' + labels[key].replace(/[?]/g, '\\?') + '[^<]*</span>[\\s\\S]*?<td class="num">(\\d+) of (\\d+)</td><td class="num">(\\d+)%</td><td class="num">(\\d+)</td>'));
    assert.ok(m, `${key}: its row is on the page`);
    assert.deepEqual([+m[1], +m[2], +m[4]], [e.confirmed, e.total, e.open], `${key}: confirmed, total and open match the recount`);
    assert.equal(+m[3], e.total ? Math.round((100 * e.confirmed) / e.total) : 0, `${key}: the share is the rounded percentage`);
  }
  assert.match(html, /verified text LLMs that are not one-time trial credits/, 'the population of model_tier and free_limits is stated');
  assert.match(html, /all verified providers/);
});

test('/coverage/ has one task row per open gap, each with the official docs and a prefilled issue', () => {
  const { providers } = JSON.parse(readFileSync(DATA, 'utf8'));
  const html = readFileSync(join(ROOT, 'site/coverage/index.html'), 'utf8');
  const gaps = Object.values(coverageByHand(providers)).reduce((n, e) => n + e.open, 0);
  const rows = html.match(/<li class="cov-task">[\s\S]*?<\/li>/g) || [];
  assert.equal(rows.length, gaps, 'the number of task rows is the sum of the gaps');
  const docs = new Map(providers.map((p) => [p.name, p.docs_url]));
  for (const row of rows) {
    assert.match(row, /href="\.\.\/p\/[a-z0-9-]+"/, 'the provider links to its page');
    assert.match(row, /https:\/\/github\.com\/pacocartones\/free-llm-api-hub\/issues\/new\?template=inaccuracy\.yml&amp;provider=[a-z0-9-]+&amp;title=/, 'a prefilled issue of the existing template');
    const name = row.match(/<a href="\.\.\/p\/[^"]+">([^<]*)<\/a>/)[1].replace(/&amp;/g, '&');
    const url = docs.get(name);
    assert.ok(url && row.includes(`href="${url.replace(/&/g, '&amp;')}"`), `${name}: the row links the provider's own docs_url`);
  }
  // an unknown value reads "not confirmed", never "no": every open group says so, and no task row states a value
  const summaries = html.match(/<summary>[\s\S]*?<\/summary>/g) || [];
  assert.ok(summaries.length >= 1, 'there are open groups');
  assert.ok(summaries.every((x) => /not confirmed/.test(x)), 'every open group says not confirmed');
  assert.ok(rows.every((r) => !/\b(yes|no)\b/i.test(r.replace(/<a href="\.\.\/p\/[^"]*">[^<]*<\/a>/, '').replace(/<[^>]+>/g, ' ').replace(/official docs|propose the value/g, ''))), 'a task row never states a value, only that it is open');
});

test('/coverage/ escapes hostile provider text and refuses a non-http docs link', () => {
  const evil = { slug: 'evil', name: '<img src=x onerror=alert(1)>', docs_url: 'javascript:alert(1)', verified: true, is_text_llm: true, free_type: 'perpetual', card_required: null };
  const rows = [{ key: 'card_required', label: 'Credit card required?', population: 'all verified providers', total: 1, confirmed: 0, open: [evil] }];
  const out = coverageMainHtml(rows, { repo: 'https://github.com/o/r', generated: '2026-10-13', prefix: '../' });
  assert.ok(!out.includes('<img'), 'the name cannot open a tag');
  assert.ok(out.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!/href="javascript:/i.test(out), 'a javascript: docs link is never an href');
  assert.match(out, /no official docs link/);
  assert.equal(coverageOf([{ ...evil, verified: false }]).every((r) => r.total === 0), true, 'an unverified provider counts in no population');
});

test('/coverage/ says how to propose one value, is in the sitemap with an absolute canonical and is linked from both footers', () => {
  run(['scripts/build.mjs']);
  const html = readFileSync(join(ROOT, 'site/coverage/index.html'), 'utf8');
  assert.match(html, /one value with its source/);
  assert.match(html, /CONTRIBUTING\.md/);
  assert.match(html, /<link rel="canonical" href="https:\/\/freellmapihub\.com\/coverage\/">/);
  assert.match(readFileSync(join(ROOT, 'site/sitemap.xml'), 'utf8'), /<loc>https:\/\/freellmapihub\.com\/coverage\/<\/loc>/);
  assert.match(readFileSync(join(ROOT, 'site/index.html'), 'utf8'), /<a href="coverage\/">Data coverage<\/a>/, 'the hand-written home footer');
  assert.match(readFileSync(join(ROOT, 'site/p/groq.html'), 'utf8'), /<a href="\.\.\/coverage\/">Data coverage<\/a>/, 'the shared footer of a generated page');
});

test('a11y: the filter chips stay reachable by keyboard and screen reader, with a visible focus', () => {
  const css = readFileSync(join(ROOT, 'site/styles.css'), 'utf8');
  assert.doesNotMatch(css, /\.chip input\s*\{[^}]*display\s*:\s*none/, 'a display:none checkbox leaves the chip out of the tab order and the accessibility tree');
  assert.match(css, /\.chip:has\(input:focus-visible\)/, 'the focused chip shows an outline');
  assert.match(css, /--control-border:\s*#[0-9a-f]{6}/i, 'a control border token exists for the 3:1 non-text contrast');

  const index = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  const chips = index.match(/<label class="chip">[\s\S]*?<\/label>/g) || [];
  assert.ok(chips.length >= 6, 'the six filter chips are in the template');
  for (const chip of chips) assert.match(chip, /<input type="checkbox" id="f-[a-z]+">/, 'each chip label contains its checkbox, so the label stays the click target');
});

test('a11y: small fixes stay in place (finite caret, placeholder colour, no 320px minimum, focus kept after Clear and Escape)', () => {
  const css = readFileSync(join(ROOT, 'site/styles.css'), 'utf8');
  const caret = css.split('\n').find((l) => l.startsWith('.caret {'));
  assert.ok(caret && !/infinite/.test(caret), 'the caret blink stops by itself (WCAG 2.2.2)');
  assert.match(css, /::placeholder\s*\{[^}]*color:\s*var\(--muted\)/, 'placeholder text uses the muted colour');
  assert.doesNotMatch(css, /\.limits-table\s*\{[^}]*min-width:\s*320px/, 'the limits table has no 320px minimum (reflow at 320px)');
  assert.match(css, /minmax\(min\(280px, 100%\), 1fr\)/, 'collection tracks never exceed the container');
  assert.match(readFileSync(join(ROOT, 'site/explorer.js'), 'utf8'), /getElementById\('q'\)\.focus\(\)/, 'Clear keeps the focus on the search box');
  assert.match(readFileSync(join(ROOT, 'site/site.js'), 'utf8'), /setNav\(false\); navToggle\.focus\(\)/, 'Escape returns the focus to the menu button');
});

// ---- /data-policy/ — who trains on your data -----------------------------------------------------
import { trainState, dataPolicyRows, dataPolicyCounts, dataPolicyMainHtml } from './lib/data-policy-page.mjs';

test('data-policy page: yes or no only with the provider\'s sentence; a value without one reads not confirmed', () => {
  const q = 'We do not use your prompts to train models.';
  assert.equal(trainState({ data_policy: { trains_on_prompts: true, quote: q } }), 'yes');
  assert.equal(trainState({ data_policy: { trains_on_prompts: false, quote: q } }), 'no');
  assert.equal(trainState({ data_policy: { trains_on_prompts: false } }), 'recorded', 'a boolean alone is not the provider\'s word');
  assert.equal(trainState({ data_policy: { trains_on_prompts: true, quote: '   ' } }), 'recorded', 'an empty sentence is no sentence');
  assert.equal(trainState({ data_policy: { trains_on_prompts: null, retention: '30 days', quote: q } }), 'unknown');
  assert.equal(trainState({ data_policy: null }), 'unknown');
  assert.equal(trainState({}), 'unknown');
  assert.equal(trainState({ data_policy: { trains_on_prompts: 'false', quote: q } }), 'unknown', 'a string is not a boolean');
  const rows = dataPolicyRows([{ name: 'A', slug: 'a', verified: true, data_policy: { trains_on_prompts: false, source: 'https://example.com/p', checked: '2026-10-15' } }]);
  const html = dataPolicyMainHtml(rows, { repo: 'https://github.com/x/y', generated: '2026-10-15', prefix: '../' });
  const row = html.slice(html.indexOf('<tbody>'));
  assert.doesNotMatch(row, /Sentence: does not train|Sentence: may train/, 'a true or false without a sentence must not read as a statement');
  assert.match(row, /Not confirmed: a value is recorded, no sentence yet/);
});

test('data-policy page: the counts come from the rows, every verified provider has one row, and nothing is written by hand', () => {
  const providers = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8')).providers;
  const rows = dataPolicyRows(providers);
  const c = dataPolicyCounts(rows);
  assert.equal(rows.length, providers.filter((p) => p.verified === true).length);
  assert.equal(c.yes + c.no + c.recorded + c.unknown, c.total);
  assert.equal(c.notConfirmed, c.recorded + c.unknown);
  assert.equal(c.withTrainingQuote + c.withRetentionQuote, c.withQuote, 'every sentence is either about training or about retention');
  assert.equal(c.withTrainingQuote, rows.filter((r) => r.quote && (r.state === 'yes' || r.state === 'no')).length);
  const html = readFileSync(join(ROOT, 'site/data-policy/index.html'), 'utf8');
  assert.match(html, new RegExp(`For each of ${c.total} verified providers, this page shows the sentence from the provider's own page about training on prompts where one is recorded\\. ${c.withTrainingQuote} rows have one about training${c.withRetentionQuote ? ` (${c.withRetentionQuote} more carry a sentence about retention only)`.replace(/[()]/g, '\\$&') : ''}; ${c.notConfirmed} are not confirmed \\(${c.recorded} of them have a value in the dataset but no sentence yet\\)`));
  assert.match(html, new RegExp(`${c.no} have a recorded sentence that says they do not train on prompts, ${c.yes} have one that says they may, and ${c.notConfirmed} are not confirmed`));
  assert.equal((html.match(/<tr><th scope="row">/g) || []).length, c.total, 'one row per verified provider');
  assert.match(readFileSync(join(ROOT, 'site/sitemap.xml'), 'utf8'), /<loc>https:\/\/freellmapihub\.com\/data-policy\/<\/loc>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/freellmapihub\.com\/data-policy\/">/);
  if (c.withQuote === 0) assert.doesNotMatch(html.slice(html.indexOf('<tbody>')), /Sentence: (may|does not) train/, 'no row reads as a statement while no sentence is recorded');
});

test('data-policy page: a missing sentence and a missing source are said so; a sentence and a source are escaped and only http(s) links are made', () => {
  const base = { name: 'Acme <b>', slug: 'acme', verified: true };
  const rows = dataPolicyRows([
    { ...base, data_policy: null },
    { ...base, slug: 'beta', data_policy: { trains_on_prompts: false, retention: null, source: 'javascript:alert(1)', checked: '2026-10-15' } },
    { ...base, slug: 'gamma', data_policy: { trains_on_prompts: true, retention: null, source: 'https://example.com/terms', checked: '2026-10-15', quote: 'We may use "your" <content>.', note: 'Free plan only.' } },
  ]);
  const html = dataPolicyMainHtml(rows, { repo: 'https://github.com/x/y', generated: '2026-10-15', prefix: '../' });
  assert.match(html, /Not confirmed/);
  assert.match(html, /No sentence recorded yet\./);
  assert.match(html, /no source recorded/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /We may use &quot;your&quot; &lt;content&gt;\./);
  assert.match(html, /&ldquo;We may use &quot;your&quot; &lt;content&gt;\.&rdquo;<\/blockquote><p class="muted dp-foot">Acme &lt;b&gt;, page: <a href="https:\/\/example\.com\/terms"[^>]*>https:\/\/example\.com\/terms<\/a>, read on 2026-10-15\.<\/p>/, 'a sentence carries its provider, page and day');
  assert.match(html, /Sentence: may train/);
  assert.match(html, /Free plan only\./);
  assert.match(html, /href="https:\/\/example\.com\/terms"/);
  assert.doesNotMatch(html, /Acme <b>/, 'a name from the data is escaped');
});

// Our own words only: the title, the description, the hero and the main text, without the provider's quoted sentences, which are shown as written.
const dpOurWords = (html) => {
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  const hero = (html.match(/<section class="page-hero[\s\S]*?<\/section>/) || [''])[0];
  const main = html.slice(html.indexOf('<main id="main"'), html.indexOf('</main>'));
  // The attribution line under a sentence carries the provider's name and its page address, which can say privacy: it is the provider's, not our words.
  return [title, desc, hero, main].join(' ').replace(/<blockquote[\s\S]*?<\/blockquote>/g, ' ').replace(/<p class="muted dp-foot">[\s\S]*?<\/p>/g, ' ').replace(/<[^>]*>/g, ' ').replace(/«[^»]*»/g, ' '); // a phrase between « » in a note is the provider's own wording, like a quote
};
const DP_BANNED = /\b(safe|safer|secure|private|privacy|privacy-friendly|guarantee[sd]?|trustworthy|best|worst|better|worse|we check|we copy|always|never trains)\b/i;

test('data-policy page: no word that promises safety or ranks providers, no process promise, no advice; a quote may use any word', () => {
  const html = readFileSync(join(ROOT, 'site/data-policy/index.html'), 'utf8');
  const visible = dpOurWords(html);
  assert.doesNotMatch(visible, DP_BANNED);
  assert.doesNotMatch(visible, /not legal advice|before you rely|always confirm/i, 'no advice and no disclaimer in our voice');
  assert.equal((html.slice(html.indexOf('<main id="main"'), html.indexOf('</main>')).match(/<h3>/g) || []).length, 5, 'five questions, as text only');
  assert.doesNotMatch(html, /FAQPage/, 'no FAQPage markup until enough rows carry a sentence');
  assert.match(visible, /Sentence: does not train.*Sentence: may train.*Not confirmed/is, 'the legend of the three states is on the page');
  assert.match(visible, /That never means &ldquo;no&rdquo;/i);
  // A provider's quoted sentence may contain a banned word: it is shown as written and is not scanned.
  const rows = dataPolicyRows([{ name: 'Acme', slug: 'acme', verified: true, data_policy: { trains_on_prompts: false, source: 'https://example.com/privacy-policy', checked: '2026-10-15', quote: 'We guarantee that your prompts are private.' } }]);
  const fixture = dataPolicyMainHtml(rows, { repo: 'https://github.com/x/y', generated: '2026-10-15' });
  assert.match(fixture, /We guarantee that your prompts are private\./);
  assert.doesNotMatch(dpOurWords(fixture), DP_BANNED, 'the quoted sentence and its attribution line (a page address that says privacy) are exempt');
});

test('data-policy page: a phrase between « » in a note is the provider\'s own and is exempt; the same word outside them is not', () => {
  const mk = (note) => dataPolicyMainHtml(dataPolicyRows([{ name: 'Acme', slug: 'acme', verified: true, data_policy: { trains_on_prompts: false, source: 'https://example.com/terms', checked: '2026-10-15', quote: 'We do not train.', note } }]), { repo: 'https://github.com/x/y', generated: '2026-10-15' });
  assert.doesNotMatch(dpOurWords(mk('The «Privacy Policy» is the document.')), DP_BANNED, 'the document title between « » is the provider\'s');
  assert.match(dpOurWords(mk('This is the best privacy policy.')), DP_BANNED, 'the same words in our own voice are caught');
});

test('data_policy: the sentence and its note are plain text, bounded, and go with a stated part', () => {
  const good = { trains_on_prompts: true, retention: null, source: 'https://example.com/terms', checked: '2026-10-09' };
  const target = (d) => d.providers.find((p) => p.verified === true);
  assert.equal(validateAfter((d) => { target(d).data_policy = { ...good, quote: 'We may use your content.', note: 'Free plan.' }; }), true, 'a sentence and a note pass');
  assert.equal(validateAfter((d) => { target(d).data_policy = { ...good, quote: null, note: null }; }), true, 'null means none recorded');
  for (const bad of [{ quote: '' }, { quote: '   ' }, { quote: 'x'.repeat(401) }, { note: 'x'.repeat(301) }, { quote: 'a\u200bb' }, { quote: 'a\u202eb' }, { quote: 'a\u0007b' }, { note: 'a\ufeffb' }, { quote: 'a\u061cb' }, { quote: 'a\u00adb' }, { quote: 'a\u034fb' }, { quote: 'a\u180eb' }, { quote: 'a\ufe0fb' }, { quote: 'a\u{e0041}b' }, { quote: 'a\u180bb' }, { quote: 'a\u115fb' }, { quote: 'a\u17b4b' }, { quote: 'a\u2800b' }, { quote: 'a\u3164b' }, { quote: 'a\uffa0b' }, { quote: 42 }]) {
    assert.equal(validateAfter((d) => { target(d).data_policy = { ...good, ...bad }; }), false, `rejected: ${JSON.stringify(bad).slice(0, 40)}`);
  }
  assert.equal(validateAfter((d) => { target(d).data_policy = { ...good, trains_on_prompts: null, retention: null, quote: 'Some sentence.' }; }), false, 'a sentence alone records nothing');
});

// ---- pinned bars never cover the focused element (WCAG 2.4.11, 1.4.10) ----
test('a11y: the filter bar is pinned only where there is room, and a focused row scrolls in below both bars', () => {
  const css = readFileSync(join(ROOT, 'site/styles.css'), 'utf8');
  const js = readFileSync(join(ROOT, 'site/explorer.js'), 'utf8');
  const base = css.match(/^\.controls \{[^}]*\}/m);
  assert.ok(base, 'the base .controls rule exists');
  assert.doesNotMatch(base[0], /position:\s*sticky/, 'the bar is not pinned by default: at 360x700 it is 340px tall and at 320x256 taller than the screen');
  const media = css.match(/@media \(min-width: 761px\) and \(min-height: 600px\) \{([\s\S]*?)\n\}/);
  assert.ok(media, 'the pinned mode lives in a media query for wide and tall screens');
  assert.match(media[1], /\.controls \{ position: sticky; top: var\(--header-h\); \}/, 'pinned only there');
  assert.match(media[1], /scroll-padding-top: calc\(var\(--header-h\) \+ var\(--controls-h, 120px\) \+ 12px\)/, 'the scroll padding counts both bars');
  assert.match(js, /new ResizeObserver\(\(\) => document\.documentElement\.style\.setProperty\('--controls-h'/, 'the real height of the wrapping bar is measured');
  assert.match(css, /^html \{ scroll-behavior: smooth; scroll-padding-top: calc\(var\(--header-h\) \+ 12px\); \}/m, 'with the bar not pinned, only the header needs room');
});

// ---- links inside running text are underlined (WCAG 1.4.1; axe link-in-text-block) ----
test('a11y: a plain link inside a paragraph or a list item is underlined, so it does not rest on colour alone', () => {
  const css = readFileSync(join(ROOT, 'site/styles.css'), 'utf8');
  assert.match(css, /main p a:not\(\[class\]\), main li a:not\(\[class\]\) \{ text-decoration: underline; text-underline-offset: 2px; \}/);
  // The case that axe found on /best/: a classless link in the lead paragraph.
  const best = readFileSync(join(ROOT, 'site/best/index.html'), 'utf8');
  assert.match(best, /<p[^>]*>[^<]*<a href="methodology\/">how the score works<\/a>/, 'the link axe measured is a classless link inside a paragraph, so the rule reaches it');
});

// ---- reflow at 320 CSS px (WCAG 1.4.10): a wide data table scrolls inside its own region, and the header fits ----
test('a11y: wide data tables sit in a keyboard-reachable scroll region and the header fits at 320px', () => {
  const css = readFileSync(join(ROOT, 'site/styles.css'), 'utf8');
  assert.match(css, /^\.table-scroll \{ overflow-x: auto; max-width: 100%; position: relative; \}/m, 'the region is positioned, so the screen-reader-only text inside the table cannot widen the page');
  assert.match(css, /@media \(max-width: 340px\) \{\s*\.header-actions \.star-count \{ display: none; \}/, 'at 320px the star count is dropped so the header buttons stay in the viewport');
  const region = /<div class="table-scroll" role="region" aria-label="[^"]+" tabindex="0"><table/;
  for (const f of ['site/data-policy/index.html', 'site/collections/no-training.html', 'site/collections/no-credit-card.html']) {
    const html = readFileSync(join(ROOT, f), 'utf8');
    assert.match(html, region, `${f}: the table is in a labelled, focusable scroll region`);
    assert.equal((html.match(/<table/g) || []).length, (html.match(/class="table-scroll"/g) || []).length, `${f}: every table of the page is in one`);
  }
  assert.match(readFileSync(join(ROOT, 'site/programs/startups.html'), 'utf8'), region, 'the programs table too');
});

// ---- the data-policy table fits a laptop screen (measured: 1114px at 1100px before, 1052px after) ----
test('data_policy lot 2: at least 21 of 68, the four new rows carry a quote and a source', () => {
  const data = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  const withPolicy = data.providers.filter((p) => p.data_policy);
  assert.ok(withPolicy.length >= 21, 'lot 2 raised the covered providers to 21; later lots only add (the exact count is pinned by the latest lot test)');
  for (const slug of ['assemblyai', 'elevenlabs', 'voyage-ai', 'cartesia']) {
    const dp = data.providers.find((p) => p.slug === slug).data_policy;
    assert.ok(dp, `${slug} has a data_policy`);
    assert.equal(dp.trains_on_prompts, true, `${slug}: the provider's own sentence says it trains`);
    assert.match(dp.source, /^https:\/\//, `${slug}: https source`);
    assert.equal(dp.checked, '2026-10-15', `${slug}: read date`);
    assert.ok(dp.quote && dp.quote.length <= 400, `${slug}: literal quote within the limit`);
  }
  const assembly = data.providers.find((p) => p.slug === 'assemblyai').data_policy;
  assert.match(assembly.note, /Free users do not have the ability to opt out/, 'the free plan is stated for AssemblyAI');
  // Deepgram stayed out of lot 2 (its only source then was a voluntary programme); lot 5 brings it in from its terms, and its test is there.
});

test('data_policy lot 3: at least 23 of 68, LlamaParse says it does not train, Retell AI trains only if recording is not opted out', () => {
  const data = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
  assert.ok(data.providers.filter((p) => p.data_policy).length >= 23, 'lot 3 raised the covered providers to 23; later lots only add (the exact count is pinned by the latest lot test)');
  const llama = data.providers.find((p) => p.slug === 'llamaparse').data_policy;
  assert.equal(llama.trains_on_prompts, false);
  assert.equal(llama.quote, 'We do not train any models on User Content.');
  assert.match(llama.note, /up to 48 hours after processing/, 'the retention sentence is in the note');
  assert.match(llama.note, /names no plan/, 'the note says the page names no plan');
  const retell = data.providers.find((p) => p.slug === 'retell-ai').data_policy;
  assert.equal(retell.trains_on_prompts, true);
  assert.match(retell.quote, /^If you do not opt-out of recording/, 'the condition is in the quote');
  assert.match(retell.note, /Only if you do not opt out of recording/, 'the condition is in the note');
  for (const dp of [llama, retell]) {
    assert.match(dp.source, /^https:\/\//);
    assert.equal(dp.checked, '2026-10-15');
  }
});

test('data_policy.plan_named: true, false, null or absent; anything else is rejected', () => {
  const good = { trains_on_prompts: false, retention: null, source: 'https://example.com/terms', checked: '2026-10-09', quote: 'We do not train.' };
  const one = (d) => d.providers[0];
  for (const v of [true, false, null]) assert.equal(validateAfter((d) => { one(d).data_policy = { ...good, plan_named: v }; }), true, `accepted: ${v}`);
  assert.equal(validateAfter((d) => { one(d).data_policy = { ...good }; }), true, 'absent means not checked');
  for (const bad of ['yes', 'false', 0, 1, [], {}]) assert.equal(validateAfter((d) => { one(d).data_policy = { ...good, plan_named: bad }; }), false, `rejected: ${JSON.stringify(bad)}`);
});

test('data_policy lot 4: the 13 providers that say they do not train were read for the plan; none names it; the notes stay in the limit', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  const falses = data.providers.filter((p) => p.data_policy && p.data_policy.trains_on_prompts === false);
  assert.ok(falses.length >= 14, 'the 13 read for the plan in lot 4, Runware (lot 5) and the later ones: every one carries plan_named false');
  for (const p of falses) {
    assert.equal(p.data_policy.plan_named, false, `${p.slug}: read for the plan, not named`);
    assert.ok(p.data_policy.checked >= '2026-10-15', `${p.slug}: read on or after the lot 4 day (a later re-read of a row is fine)`);
    assert.ok(p.data_policy.note && p.data_policy.note.length <= 300, `${p.slug}: note within 300 characters`);
  }
  for (const p of data.providers.filter((q) => q.data_policy && q.data_policy.trains_on_prompts !== false)) {
    // rows that say it may train were read for the plan later (lots 2, 3, 5 and the correction of the absence claims): true where the
    // clause names the free users or free usage (AssemblyAI, Voyage AI), false where it does not
    const READ = { assemblyai: true, 'voyage-ai': true, elevenlabs: false, cartesia: false, 'retell-ai': false, deepgram: false, 'arli-ai': false, 'sarvam-ai': false, poolside: false };
    if (p.slug in READ) assert.equal(p.data_policy.plan_named, READ[p.slug], `${p.slug}: plan_named as read`);
    else assert.equal(p.data_policy.plan_named, undefined, `${p.slug}: not read for the plan yet, so no value is written`);
  }
  const api = JSON.parse(readFileSync(join(ROOT, 'site/api/v1/providers.json'), 'utf8'));
  const row = (api.providers || api).find((p) => p.slug === 'modal');
  assert.equal(row.data_policy.plan_named, false, 'the API carries the new field');
});

test('data_policy lot 5: at least 25 of 68, Deepgram trains by its terms with an opt-out, Runware says it does not', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  assert.ok(data.providers.filter((p) => p.data_policy).length >= 25, 'lot 5 raised the covered providers to 25; later lots only add (the exact count is pinned by the latest lot test)');
  const dg = data.providers.find((p) => p.slug === 'deepgram').data_policy;
  assert.equal(dg.trains_on_prompts, true); assert.equal(dg.source, 'https://deepgram.com/terms'); assert.equal(dg.plan_named, false);
  assert.match(dg.quote, /including training and testing our Models\.$/); assert.match(dg.note, /opt out of model training on a per-request basis/);
  assert.doesNotMatch(dg.note, /\bonly\b/, 'an absence is not proved by a substring search, so the note does not claim one');
  const rw = data.providers.find((p) => p.slug === 'runware').data_policy;
  assert.equal(rw.trains_on_prompts, false); assert.equal(rw.source, 'https://runware.ai/terms'); assert.equal(rw.plan_named, false);
  assert.match(rw.note, /aggregated or de-identified operational data/);
  for (const dp of [dg, rw]) { assert.equal(dp.checked, '2026-10-15'); assert.ok(dp.quote.length <= 400 && dp.note.length <= 300); }
});

test('data_policy lot 6: at least 26 of 68, AI21 says it does not train, with the conditions of its own sentence', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  assert.ok(data.providers.filter((p) => p.data_policy).length >= 26, 'lot 6 raised the covered providers to 26; later rows only add');
  const dp = data.providers.find((p) => p.slug === 'ai21').data_policy;
  assert.equal(dp.trains_on_prompts, false); assert.equal(dp.plan_named, false); assert.equal(dp.checked, '2026-10-15');
  assert.equal(dp.source, 'https://www.ai21.com/terms-policies/privacy-policy/', 'the final address, not the one that redirects');
  assert.match(dp.quote, /unless otherwise agreed in writing or required to provide the Services/, 'the condition is in the quote');
  assert.match(dp.note, /for example, for individual-developer accounts/); assert.match(dp.note, /has no mention of a free, trial, paid or other plan/);
  assert.ok(dp.quote.length <= 400 && dp.note.length <= 300);
  const md = readFileSync(join(ROOT, 'collections/no-training.md'), 'utf8');
  assert.ok(md.split('\n').some((l) => l.startsWith('| **[AI21')), 'AI21 is in the no-training collection');
});

test('data_policy lot 7: 29 of 68, Poolside may train on your Content by its Terms of Use unless you opt out (#341)', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  assert.equal(data.providers.filter((p) => p.data_policy).length, 29, 'the count of covered providers');
  const dp = data.providers.find((p) => p.slug === 'poolside').data_policy;
  assert.equal(dp.trains_on_prompts, true, 'may train, even though you can opt out');
  assert.equal(dp.retention, null, 'the terms state no retention period for Content');
  assert.equal(dp.source, 'https://poolside.ai/legal/eula', 'the Terms of Use, which cover the APIs and Poolside Platform');
  assert.equal(dp.checked, '2026-10-15'); assert.equal(dp.plan_named, false);
  assert.equal(dp.quote, 'We may use your Content to provide, maintain, improve, and develop the Products and other Poolside offerings, including training our models, unless you opt-out.', 'section 4, literal');
  assert.match(dp.note, /if you give Feedback or it is flagged for safety review/, 'the exceptions to the opt-out are in the note');
  assert.ok(dp.quote.length <= 400 && dp.note.length <= 300);
  const registry = JSON.parse(readFileSync(join(ROOT, 'data/quotes.json'), 'utf8'));
  assert.ok(registry.entries.some((e) => e.slug === 'poolside' && e.kind === 'sentence' && e.text === dp.quote), 'the quote has its register entry');
  const md = readFileSync(join(ROOT, 'collections/no-training.md'), 'utf8');
  assert.ok(!md.split('\n').some((l) => l.startsWith('| **[Poolside')), 'Poolside is not in the no-training collection');
  assert.match(readFileSync(join(ROOT, 'site/data-policy/index.html'), 'utf8'), /Poolside/, 'the data-policy page lists Poolside');
});

test('correction of the absence claims: no note says the page names no plan unless the page has none of the four words, and Voyage AI names free usage', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  const dpOf = (slug) => data.providers.find((p) => p.slug === slug).data_policy;
  for (const slug of ['voyage-ai', 'cartesia', 'retell-ai', 'llamaparse', 'scaleway', 'moondream']) assert.doesNotMatch(dpOf(slug).note, /\bThe page names no/i, `${slug}: no statement about the whole page`);
  assert.equal(dpOf('voyage-ai').plan_named, true);
  assert.match(dpOf('voyage-ai').note, /credits or tokens for free usage of the Service may be automatically void/, 'the passage about free usage is in the note');
  assert.match(readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'), /^- \*\*Corrección:\*\*/m, 'the correction is visible in the changelog');
});

test('data_policy: Arli AI, from a contributor, states retention only: trains stays not confirmed, the quote is literal and has its register entry', () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  assert.ok(data.providers.filter((p) => p.data_policy).length >= 27, 'Arli AI raised the covered providers to 27; later rows only add (the exact count is pinned by the latest test)');
  const dp = data.providers.find((p) => p.slug === 'arli-ai').data_policy;
  assert.equal(dp.trains_on_prompts, null, 'the policy says nothing about training: not stated is not no');
  assert.match(dp.retention, /processed transiently and immediately discarded/); assert.equal(dp.plan_named, false);
  assert.equal(dp.quote, 'We do not log, store, or have access to the content of your prompts or the outputs generated by the models', 'literal: no full stop the page does not have');
  const registry = JSON.parse(readFileSync(join(ROOT, 'data/quotes.json'), 'utf8'));
  assert.ok(registry.entries.some((e) => e.slug === 'arli-ai' && e.kind === 'sentence' && e.text === dp.quote));
  const md = readFileSync(join(ROOT, 'collections/no-training.md'), 'utf8');
  assert.ok(!md.includes('Arli AI'), 'a provider with trains_on_prompts null is not in the no-training collection');
});

test('mobile: the two long text cells stack their label above the text at 720px', () => {
  const css = readFileSync(join(ROOT, 'site/styles.css'), 'utf8').replace(/\s+/g, ' ');
  assert.match(css, /#table td\.notes, #table td:nth-child\(3\) \{ display: block; \}/, 'the notes and the catch cells are blocks, not a 40% label beside a narrow column');
  assert.match(css, /#table td\.notes::before, #table td:nth-child\(3\)::before \{ display: block;/, 'the label sits above the text');
});

test('data-policy page: five columns, the help link inside the source cell, and the header labels may wrap', () => {
  const html = readFileSync(join(ROOT, 'site/data-policy/index.html'), 'utf8');
  const head = html.slice(html.indexOf('<thead>'), html.indexOf('</thead>'));
  assert.equal((head.match(/<th scope="col">/g) || []).length, 5, 'five columns: provider, state, retention, own words, source and help');
  assert.doesNotMatch(head, />Help</, 'no separate Help column: it was the one cut off at 1100px');
  const row = html.slice(html.indexOf('<tbody>')).match(/<tr>[\s\S]*?<\/tr>/)[0];
  assert.match(row, /<td>[\s\S]*?<p class="muted dp-foot"><a href="[^"]+\/issues\/new[^"]*"[^>]*>add or correct(<span class="sr-only">[^<]*<\/span>)*<\/a><\/p><\/td><\/tr>/, 'the add-or-correct link sits under the source');
  assert.match(readFileSync(join(ROOT, 'site/styles.css'), 'utf8'), /^\.dp-table thead th \{ white-space: normal; \}/m, 'the long header labels wrap instead of widening the table');
});

// ---- every table names itself and its headers (WCAG 1.3.1, 2.4.6) ----
test('tables: labelTables adds a caption from the nearest heading and a scope to every header, and leaves what is already there', () => {
  const html = '<h1>Page</h1><h2>Free <em>limits</em></h2><h3>Detail</h3><table><thead><tr><th>A</th><th class="n">B</th></tr></thead><tbody><tr><th>row</th><td>1</td></tr></tbody></table>';
  const out = labelTables(html);
  assert.match(out, /<table><caption class="sr-only">Free limits<\/caption>/, 'the nearest h1 or h2, tags removed; an h3 is not used');
  assert.match(out, /<th scope="col">A<\/th><th scope="col" class="n">B<\/th>/, 'a header row gets scope col');
  assert.match(out, /<th scope="row">row<\/th>/, 'a header beside data cells gets scope row');
  const kept = labelTables('<h2>X</h2><table><caption>Mine</caption><tr><th scope="rowgroup">G</th><td>1</td></tr></table>');
  assert.equal((kept.match(/<caption/g) || []).length, 1, 'an existing caption is kept and none is added');
  assert.match(kept, /<caption>Mine<\/caption>/);
  assert.match(kept, /<th scope="rowgroup">/, 'an existing scope is kept');
  assert.match(labelTables('<table><tr><th>A</th></tr></table>'), /<caption class="sr-only">Table<\/caption>/, 'no heading above: a plain name');
  assert.equal(labelTables('<p>no table</p>'), '<p>no table</p>');
});

test('tables: every table of every generated page has a caption and every header cell a scope', () => {
  const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : []; });
  const bad = [];
  let tables = 0;
  for (const f of walk(join(ROOT, 'site'))) {
    for (const tbl of readFileSync(f, 'utf8').match(/<table\b[^>]*>[\s\S]*?<\/table>/g) || []) {
      tables += 1;
      if (!/<caption\b/.test(tbl)) bad.push(`${relative(ROOT, f)}: a table without caption`);
      for (const th of tbl.match(/<th\b[^>]*>/g) || []) if (!/\bscope=/.test(th)) { bad.push(`${relative(ROOT, f)}: ${th} without scope`); break; }
    }
  }
  assert.ok(tables > 50, `the check really saw the tables (${tables})`);
  assert.deepEqual(bad, []);
});

// ---- a link that opens a new tab says so, and repeated link texts say what they are for (WCAG 2.4.4, 3.2.5) ----
test('links: markNewTabLinks adds a screen-reader note to every link that opens a new tab and touches nothing else', () => {
  const out = markNewTabLinks('<p><a href="https://a.example" target="_blank" rel="noopener">docs</a> <a href="/x">same tab</a> <a target="_blank" href="y">y <b>bold</b></a></p><script>var s = \'<a target="_blank">in a script</a>\';</script><style>a[target="_blank"]{}</style>');
  assert.match(out, /docs<span class="sr-only"> \(opens in a new tab\)<\/span><\/a>/);
  assert.match(out, /<a href="\/x">same tab<\/a>/, 'a same-tab link is untouched');
  assert.match(out, /y <b>bold<\/b><span class="sr-only"> \(opens in a new tab\)<\/span><\/a>/, 'inner markup is kept');
  assert.match(out, /<script>var s = '<a target="_blank">in a script<\/a>';<\/script>/, 'a script is untouched');
  assert.equal(markNewTabLinks(out), out, 'applying it twice changes nothing');
});

test('links: on every generated page, each link that opens a new tab carries the note, and the coverage tasks name their provider', () => {
  const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : []; });
  let seen = 0;
  const bad = [];
  for (const f of walk(join(ROOT, 'site'))) {
    const html = readFileSync(f, 'utf8').replace(/<script\b[\s\S]*?<\/script>/g, '');
    for (const m of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>[\s\S]*?<\/a>/g)) { seen += 1; if (!m[0].includes('(opens in a new tab)')) bad.push(`${relative(ROOT, f)}: ${m[0].slice(0, 80)}`); }
  }
  assert.ok(seen > 500, `the check really saw the links (${seen})`);
  assert.deepEqual(bad.slice(0, 5), []);
  const cov = readFileSync(join(ROOT, 'site/coverage/index.html'), 'utf8');
  const tasks = cov.match(/<li class="cov-task">[\s\S]*?<\/li>/g) || [];
  assert.ok(tasks.length > 50, 'the coverage page lists its open tasks');
  for (const t of tasks.slice(0, 30)) {
    assert.match(t, /official docs<span class="sr-only"> for [^<]+<\/span>/, 'the docs link says whose docs');
    assert.match(t, /propose the value<span class="sr-only"> for [^<]+<\/span>/, 'the proposal link says for whom');
  }
});

// ---- focus ring contrast (WCAG 1.4.11, 2.4.7): the global ring is the accent colour, and it must stand out against every surface ----
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('a11y: the global focus ring is at least 2px, uses the accent and reaches 3:1 against every surface in both themes', () => {
  const css = readFileSync(join(ROOT, 'site/styles.css'), 'utf8');
  assert.match(css, /^:focus-visible \{ outline: 2px solid var\(--accent\); outline-offset: 2px;/m, 'the global ring: 2px, accent, offset');
  const block = (selector) => css.slice(css.indexOf(selector + ' {'), css.indexOf('\n}', css.indexOf(selector + ' {')));
  const token = (b, name) => { const m = b.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})')); assert.ok(m, `token --${name} is missing`); return m[1]; };
  for (const [theme, b] of [['dark', block(':root')], ['light', block('[data-theme="light"]')]]) {
    const ring = token(b, 'accent');
    for (const surface of ['bg', 'bg-elev', 'panel', 'panel-2']) {
      assert.ok(contrast(ring, token(b, surface)) >= 3, `${theme}: the focus ring on --${surface} is below 3:1 (${contrast(ring, token(b, surface)).toFixed(2)})`);
    }
  }
  // The ring must not be removed from a control that takes the keyboard: the only outline:none rules are the ones that draw their own focus.
  const removed = [...css.matchAll(/([^{}]+)\{[^}]*outline:\s*none[^}]*\}/g)].map((m) => m[1].trim());
  assert.deepEqual(removed.filter((s) => /th-sort|chip|\.sel\b|button|a:focus/.test(s)), [], 'no outline:none on the sort buttons, chips, selects, buttons or links');
});

// ---- Dated banner mechanism (site/site.js) ---------------------------------
// A banner hand-written in site/index.html is removed by site/site.js once its
// data-until day (UTC, inclusive) has passed; none is on the page today. The build stays
// deterministic: no clock is read at build time.
function runSiteJsAt(isoNow) {
  const src = readFileSync(join(ROOT, 'site/site.js'), 'utf8');
  let removed = false;
  const banner = {
    getAttribute: (k) => (k === 'data-until' ? '2026-10-31' : null),
    remove: () => { removed = true; },
  };
  const fakeDocument = {
    documentElement: { getAttribute: () => 'dark', setAttribute() {} },
    getElementById: (id) => (id === 'event-banner' ? banner : null),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const RealDate = Date;
  const now = RealDate.parse(isoNow);
  class FakeDate extends RealDate {
    static now() { return now; }
  }
  FakeDate.parse = RealDate.parse;
  new Function('document', 'window', 'localStorage', 'navigator', 'Date', src)(
    fakeDocument, {}, { getItem: () => null, setItem() {} }, {}, FakeDate,
  );
  return removed;
}

test('home: no campaign banner sits above the hero, and the build reads no clock for one', () => {
  const index = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  assert.equal(index.includes('event-banner'), false, 'the October campaign is over: no event banner on the home');
  assert.doesNotMatch(readFileSync(join(ROOT, 'scripts/build.mjs'), 'utf8'), /event-banner/, 'the build must not read a clock to decide a banner');
});

test('home: site.js keeps the banner through 31 October (UTC) and removes it from 1 November', () => {
  assert.equal(runSiteJsAt('2026-10-13T00:00:00Z'), false, 'mid October: banner stays');
  assert.equal(runSiteJsAt('2026-10-31T23:59:58Z'), false, 'last second of 31 October: banner stays');
  assert.equal(runSiteJsAt('2026-10-31T23:59:59.999Z'), false, 'last millisecond of 31 October: banner stays');
  assert.equal(runSiteJsAt('2026-11-01T00:00:00Z'), true, '1 November: banner is removed');
  assert.equal(runSiteJsAt('2027-02-01T12:00:00Z'), true, 'later: banner is removed');
});

// The collection of providers that say they do not train on prompts is built from
// data_policy.trains_on_prompts === false and from nothing else: a provider with
// true or an unstated policy is never listed, and the page links each row's own source.
test('the no-training collection lists exactly the providers whose data_policy says false', () => {
  run(['scripts/build.mjs']);
  const providers = JSON.parse(readFileSync(DATA, 'utf8')).providers;
  const expected = providers.filter((p) => p.data_policy && p.data_policy.trains_on_prompts === false).map((p) => p.slug).sort();
  assert.ok(expected.length >= 8, 'the card asks for at least 8 before the collection exists');
  const md = readFileSync(join(ROOT, 'collections/no-training.md'), 'utf8');
  const rows = md.split('\n').filter((l) => l.startsWith('| **['));
  assert.equal(rows.length, expected.length, 'one row per provider whose policy says false');
  const listed = providers.filter((p) => rows.some((r) => r.startsWith(`| **[${p.name}]`))).map((p) => p.slug).sort();
  assert.deepEqual(listed, expected);
  assert.ok(existsSync(join(ROOT, 'site/collections/no-training.html')), 'the page is generated');
  for (const p of providers.filter((q) => q.data_policy && q.data_policy.trains_on_prompts !== false)) {
    assert.ok(!listed.includes(p.slug), `${p.slug} is listed but its policy is not false`);
  }
});

// Whether a sentence covers the free plan is a separate fact. Until data_policy.plan_named is set (true | false | null) every row of the
// collection says "plan: not checked yet"; the page and the .md carry the header line; nobody leaves the collection for it.
test('the no-training collection carries the plan header and a plan mark on every row', () => {
  run(['scripts/build.mjs']);
  const header = 'Each row is the provider’s own sentence. Many sources do not say whether it covers the free plan; read the row’s note.';
  const md = readFileSync(join(ROOT, 'collections/no-training.md'), 'utf8');
  const html = readFileSync(join(ROOT, 'site/collections/no-training.html'), 'utf8');
  assert.ok(md.includes(header), 'the .md has the header line');
  assert.ok(html.includes(header), 'the page has the header line');
  const rows = md.split('\n').filter((l) => l.startsWith('| **['));
  assert.ok(rows.length >= 13, 'the collection keeps its rows, LlamaParse among them');
  assert.ok(rows.some((r) => r.startsWith('| **[LlamaParse')), 'LlamaParse is listed');
  // every row's mark follows its plan_named: unset or null reads "not checked yet", never "not named"
  const providers = JSON.parse(readFileSync(DATA, 'utf8')).providers;
  const word = (v) => (v === true ? 'plan named in the source' : v === false ? 'plan not named in the source' : 'plan: not checked yet');
  let marks = 0;
  for (const p of providers.filter((q) => q.data_policy && q.data_policy.trains_on_prompts === false)) {
    const row = rows.find((r) => r.startsWith(`| **[${p.name.split(' (')[0]}`));
    assert.ok(row, `${p.slug} is a row`);
    assert.ok(row.includes(`_${word(p.data_policy.plan_named)}_`), `${p.slug}: the .md mark follows plan_named`);
    marks += 1;
  }
  assert.equal(marks, rows.length, 'one mark per row');
  const other = readFileSync(join(ROOT, 'collections/no-credit-card.md'), 'utf8');
  assert.ok(!other.includes('plan: not checked yet') && !other.includes('plan not named') && !other.includes(header), 'other collections are unchanged');
});

// The point of the private copy: the builds of this file must not write in the tree of the repository, or they race
// with the builds of the other test files, which is what failed in CI (ENOTEMPTY on site/p).
test('the builds of this file leave the generated folders of the repository untouched', () => {
  assert.notEqual(ROOT, REPO, 'the tests work on a private copy of the tree');
  run(['scripts/build.mjs']);
  assert.deepEqual(mtimes(REPO), REPO_MTIMES_AT_START, 'a build in the private copy wrote in the tree of the repository');
  assert.ok(existsSync(join(ROOT, 'site/p')), 'the build did run, in the copy');
});

// A worktree made with relative paths has a .git file whose gitdir is relative; the private copy must still see the
// history, or the build would mine an empty one (the case of the worktrees that agent-start creates).
test('the private copy of a worktree with a relative gitdir still sees the history', () => {
  const base = dirname(tmpFile('x'));
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, stdio: 'pipe', encoding: 'utf8' });
  const main = join(base, 'main');
  git(base, 'init', '-q', main);
  writeFileSync(join(main, 'f.txt'), 'one\n');
  git(main, 'add', 'f.txt');
  git(main, 'commit', '-q', '-m', 'first');
  const wt = join(base, 'wt');
  git(main, 'worktree', 'add', '-q', '--detach', wt);
  // make the gitdir relative, as `git worktree add --relative-paths` does
  const abs = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(join(wt, '.git'), 'utf8'))[1];
  writeFileSync(join(wt, '.git'), `gitdir: ${relative(wt, abs)}\n`);
  assert.ok(!/^gitdir: \//.test(readFileSync(join(wt, '.git'), 'utf8')), 'the fixture gitdir is relative');
  const copy = privateTree(wt);
  assert.match(readFileSync(join(copy, '.git'), 'utf8'), /^gitdir: \//, 'the copy points at the gitdir by an absolute path');
  assert.equal(git(copy, 'log', '--format=%s').trim(), 'first', 'the copy sees the history');
});
