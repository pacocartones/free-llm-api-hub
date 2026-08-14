// Regression tests for the explorer's XSS story after the shared-rows refactor.
// provider data (providers.json) is editable via community PRs, so every field
// must be escaped before it reaches innerHTML. Rows no longer render from a
// client-side DOM skeleton: the client repaints with window.FLLM_ROWS.rowHtml —
// the SAME function build.mjs uses to SSR the table — so the escaping lives in
// exactly one place (scripts/lib/rows.mjs). These tests exercise the real
// serialised client copy (site/shared-rows.js) against hostile input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientBundle } from './lib/rows.mjs';
import { readFileSync } from 'node:fs';

// The exact client bundle the browser runs — serialised by lib/rows.mjs itself
// (the same string build.mjs writes to site/shared-rows.js), so no generated
// file has to exist on disk for the suite to pass in a clean checkout.
const SHARED_ROWS = clientBundle();

const base = {
  slug: 'groq', name: 'Groq', category: 'ongoing', free_tier: 'free tier', notes: 'n',
  rate_limits: '10 rpm', verified: true, last_verified: '2026-08-01', card_required: false,
};

// Runs the serialised client copy and returns rowHtml bound to a fake
// window.FLLM_RULES (the module imports FLAG_PAIRS/freshnessStatus from there).
function clientRowHtml(extraRules = {}) {
  const rules = {
    FLAG_PAIRS: [
      ['card_required', false, 'ic-nocard', 'no card'], ['card_required', true, 'ic-card', 'card'],
      ['phone_required', false, 'ic-nophone', 'no phone'], ['phone_required', true, 'ic-phone', 'phone'],
      ['commercial_ok', true, 'ic-building', 'commercial'], ['commercial_ok', false, 'ic-flask', 'eval only'],
      ['openai_compatible', true, 'ic-code', 'OpenAI-compat'],
    ],
    freshnessStatus: (age) => {
      if (age === null || age === undefined) return 'due';
      if (age > 90) return 'stale';
      if (age > 60) return 'due';
      return 'fresh';
    },
    ...extraRules,
  };
  const win = { FLLM_RULES: rules };
  const run = new Function('window', SHARED_ROWS);
  run(win);
  return win.FLLM_ROWS.rowHtml;
}

test('the client bundle exposes rowHtml', () => {
  const rowHtml = clientRowHtml();
  assert.equal(typeof rowHtml, 'function');
  const out = rowHtml(base, { now: '2026-08-13' });
  assert.match(out, /<tr>/);
  assert.match(out, /href="p\/groq"/);
  assert.ok(!out.includes('.html'), 'client link must match the clean-URL standard (#132)');
});

test('an HTML payload in any provider field never becomes markup', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const rowHtml = clientRowHtml();
  const out = rowHtml({
    ...base,
    name: `Evil ${payload}`, free_tier: `free ${payload}`, notes: `notes ${payload}`,
    best_for: `best ${payload}`, last_verified: `2026-08-01 ${payload}`,
  }, { now: '2026-08-13' });
  // The payload must survive as escaped TEXT. The escaped output legitimately
  // contains the substrings 'onerror=' and 'alert(' as text inside entities —
  // the attack only lands if a real tag opens, so assert on that.
  assert.ok(!/<(img|script)[\s>]/i.test(out), `payload became a real tag:\n${out}`);
  assert.ok(out.includes('&lt;img'), 'payload must be escaped, not stripped');
  // the anchor survives with escaped text, not the payload as markup
  assert.match(out, /href="p\/groq"/);
  assert.ok(out.includes('Evil &lt;img'), 'escaped payload survives in the name cell');
  assert.ok(out.includes('best &lt;img'), 'escaped payload survives in best_for');
  assert.ok(out.includes('notes &lt;img'), 'escaped payload survives in notes');
  assert.ok(out.includes('free &lt;img'), 'escaped payload survives in free_tier');
});

test('a slug that is not kebab-case renders the name without a link', () => {
  const rowHtml = clientRowHtml();
  const out = rowHtml({ ...base, slug: 'x" onmouseover="alert(1)' }, { now: '2026-08-13' });
  assert.ok(!out.includes('href="p/'), 'invalid slug must drop the anchor');
  // the hostile slug text is escaped into the name cell, never an attribute
  assert.ok(out.includes('Groq'), 'name still renders');
  assert.ok(!out.includes('onmouseover='), 'no event handler may survive');
});

test('freshness status drives the badge class and title', () => {
  const d = (daysAgo) => {
    const t = new Date('2026-08-13T00:00:00Z'); t.setUTCDate(t.getUTCDate() - daysAgo);
    return t.toISOString().slice(0, 10);
  };
  const rowHtml = clientRowHtml();
  assert.match(rowHtml({ ...base, last_verified: d(10) }, { now: '2026-08-13' }), /badge b-ok/);
  assert.match(rowHtml({ ...base, last_verified: d(75) }, { now: '2026-08-13' }), /badge b-warn/);
  assert.match(rowHtml({ ...base, last_verified: d(95) }, { now: '2026-08-13' }), /badge b-stale/);
  assert.match(rowHtml({ ...base, last_verified: d(75) }, { now: '2026-08-13' }), /title="Verified 75d ago/);
});

test('unverified entries render the warning badge and no date', () => {
  const rowHtml = clientRowHtml();
  const out = rowHtml({ ...base, verified: false, last_verified: undefined }, { now: '2026-08-13' });
  assert.match(out, /badge b-warn/);
  assert.match(out, /unverified/);
  assert.ok(!out.includes('ver-date'), 'no date cell for unverified rows');
});

test('the hero shield derives its bucket from FLLM_RULES, not a local copy', () => {
  const src = readFileSync(new URL('../site/explorer.js', import.meta.url), 'utf8');
  // It must consume the shared function…
  assert.ok(src.includes('const { recScore, SLA_DAYS, DUE_SOON_DAYS, freshnessStatus } = window.FLLM_RULES;'), 'must consume freshnessStatus from FLLM_RULES');
  assert.ok(src.includes('freshnessStatus(oldest)'), 'shield must derive its bucket via the shared function');
  // …and never re-declare the bucket thresholds inline (the drift that made
  // the hero disagree with the badge/worklist possible).
  assert.ok(!src.includes("oldest > slaDays ? 'stale'"), 'inline bucket ternary must not return');
  assert.ok(!src.includes("(DUE_SOON_DAYS || 60)"), 'inline due-soon fallback must not return');
});
