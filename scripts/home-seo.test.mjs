// The home title and description, the llms.txt counts and the provider pages' dateModified (lib/home-seo.mjs,
// lib/provider-dates.mjs): the query "Free LLM APIs" first, counts that agree with the data and with each other
// ("84 of 85 verified", never a bare verified count next to a larger total), and dates taken from the record.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homeCounts, homeTitle, homeDescription, llmsCounts, verifiedPhrase, HOME_TITLE_MAX } from './lib/home-seo.mjs';
import { providerDateModified, providerFactDates } from './lib/provider-dates.mjs';
import { datasetAsOf } from './lib/release-stamp.mjs';
import { privateTree } from './lib/private-tree.mjs';

const ROOT = privateTree(join(import.meta.dirname, '..'));
before(() => { execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' }); });
const DATA = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data/providers.json'), 'utf8'));
const unescape = (s) => s.split('&amp;').join('&');
const meta = (html, re) => unescape((html.match(re) || [])[1] || '');

test('homeTitle: the query first, both counts, under the title budget; a shorter form when the counts are long', () => {
  assert.equal(homeTitle({ total: 85, verified: 84, ongoing: 43, trial: 42 }, 'Nov 2026'), 'Free LLM APIs (Nov 2026): 85 tiers & credits, 84 verified');
  assert.equal(homeTitle({ total: 85, verified: 85, ongoing: 43, trial: 42 }, 'Nov 2026'), 'Free LLM APIs (Nov 2026): 85 tiers & credits, all verified');
  const long = homeTitle({ total: 1234, verified: 1200, ongoing: 600, trial: 634 }, 'Sept 2026');
  assert.ok(long.length <= HOME_TITLE_MAX, long);
  assert.ok(long.includes('1200 of 1234 verified'), long);
  assert.equal(verifiedPhrase({ total: 85, verified: 84 }), '84 of 85 verified');
  assert.equal(verifiedPhrase({ total: 85, verified: 85 }), 'all 85 verified');
});

test('homeDescription and llmsCounts: the split and the verified share, within the snippet budget', () => {
  const c = { total: 85, verified: 84, ongoing: 43, trial: 42 };
  assert.equal(homeDescription(c, 'Nov 2026'),
    'Free LLM APIs, Nov 2026: 43 ongoing free tiers + 42 trial credits, 84 of 85 verified. Limits, card, phone, commercial use: sourced and dated.');
  assert.ok(homeDescription({ total: 999, verified: 998, ongoing: 500, trial: 499 }, 'Sept 2026').length <= 155);
  assert.equal(llmsCounts(c), '85 providers (43 ongoing free tiers, 42 trial credits), 84 of 85 verified');
});

test('built home page: title, description and their og:/twitter: copies come from the data and agree', () => {
  const html = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
  const c = homeCounts(DATA.providers);
  const title = meta(html, /<title>([^<]*)<\/title>/);
  assert.ok(title.startsWith('Free LLM APIs'), title);
  assert.ok(title.length < 60, `${title.length}: ${title}`);
  assert.ok(title.includes(String(c.total)) && (title.includes(`${c.verified} verified`) || title.includes('all verified')), `counts from the data: ${title}`);
  assert.equal(meta(html, /<meta property="og:title" content="([^"]*)">/), title);
  assert.equal(meta(html, /<meta name="twitter:title" content="([^"]*)">/), title);
  const desc = meta(html, /<meta name="description" content="([^"]*)">/);
  assert.ok(desc.startsWith('Free LLM APIs'), desc);
  assert.ok(desc.includes(verifiedPhrase(c)) && desc.includes(`${c.ongoing} ongoing`) && desc.includes(`${c.trial} trial`), desc);
  assert.ok(desc.length <= 155, `${desc.length}`);
  assert.equal(meta(html, /<meta property="og:description" content="([^"]*)">/), desc);
  assert.equal(meta(html, /<meta name="twitter:description" content="([^"]*)">/), desc);
  // The home Dataset is dated by the dataset itself.
  const asOf = datasetAsOf(DATA);
  const dm = (html.match(/"dateModified":\s*"([^"]+)"/) || [])[1] || '';
  assert.ok(dm.startsWith(asOf), `home Dataset dateModified ${dm} is the dataset date ${asOf}`);
});

test('llms.txt states the counts the same way as the home page', () => {
  const txt = readFileSync(join(ROOT, 'site/llms.txt'), 'utf8');
  assert.ok(txt.includes(llmsCounts(homeCounts(DATA.providers))), 'counts line with "V of N verified"');
});

test('provider answer paragraph is linkable at #is-it-free, once per page', () => {
  for (const p of DATA.providers) {
    const html = readFileSync(join(ROOT, `site/p/${p.slug}.html`), 'utf8');
    assert.equal(html.split('id="is-it-free"').length - 1, 1, `${p.slug}: one #is-it-free`);
    assert.match(html, /<p class="answer-first" id="is-it-free">/, p.slug);
  }
});

test('providerDateModified: the newest dated fact, never the build day, null when nothing is dated', () => {
  const p = {
    last_verified: '2026-11-20', free_limits: { checked: '2026-11-21' }, data_policy: { checked: '2026-11-19' },
    field_checks: { card_required: { status: 'stated', checked: '2026-11-25' }, phone_required: { status: 'source_silent' } },
    published_speed: [{ checked: '2026-11-22' }, { checked: 'not a date' }],
  };
  assert.deepEqual(providerFactDates(p).sort(), ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-25']);
  assert.equal(providerDateModified(p), '2026-11-25');
  assert.equal(providerDateModified({ last_verified: '2026-11-20' }), '2026-11-20');
  assert.equal(providerDateModified({ last_verified: null }), null);
  for (const q of DATA.providers.filter((x) => x.last_verified)) assert.ok(providerDateModified(q) >= q.last_verified, q.slug);
});
