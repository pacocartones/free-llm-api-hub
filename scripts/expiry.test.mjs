import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expiryHtml } from './lib/expiry.mjs';

test('expires set: shown as is for clean strings and numbers', () => {
  assert.equal(expiryHtml({ expires: '30 days' }), '30 days');
  assert.equal(expiryHtml({ expires: '2026-12-31' }), '2026-12-31');
  assert.equal(expiryHtml({ expires: 90 }), '90');
});

test('expires set: HTML-escapes special characters', () => {
  assert.equal(
    expiryHtml({ expires: '<script>alert("xss")</script> & \'test\'' }),
    '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &#39;test&#39;'
  );
});

test('no_expiry with https source: renders link per the provider with reading date', () => {
  const result = expiryHtml({
    no_expiry: {
      source: 'https://example.com/pricing',
      checked: '2026-10-01',
    },
  });
  assert.equal(
    result,
    'no expiry <span class="muted">(<a href="https://example.com/pricing" target="_blank" rel="noopener">per the provider</a>, read 2026-10-01)</span>'
  );
});

test('no_expiry with http source: renders link per the provider with reading date', () => {
  const result = expiryHtml({
    no_expiry: {
      source: 'http://example.com/docs',
      checked: '2026-09-15',
    },
  });
  assert.equal(
    result,
    'no expiry <span class="muted">(<a href="http://example.com/docs" target="_blank" rel="noopener">per the provider</a>, read 2026-09-15)</span>'
  );
});

test('no_expiry with source containing special characters: HTML-escapes href and checked date', () => {
  const result = expiryHtml({
    no_expiry: {
      source: 'https://example.com/test?a=1&b=2',
      checked: '2026-10-01<script>',
    },
  });
  assert.equal(
    result,
    'no expiry <span class="muted">(<a href="https://example.com/test?a=1&amp;b=2" target="_blank" rel="noopener">per the provider</a>, read 2026-10-01&lt;script&gt;)</span>'
  );
});

test('no_expiry with non-http source (e.g. javascript:): renders no link', () => {
  const result = expiryHtml({
    no_expiry: {
      source: 'javascript:alert(1)',
      checked: '2026-10-01',
    },
  });
  assert.equal(result, 'no expiry <span class="muted">(per the provider, read 2026-10-01)</span>');
});

test('no_expiry with non-http source (data: or relative URL): renders no link', () => {
  assert.equal(
    expiryHtml({ no_expiry: { source: 'data:text/html,test', checked: '2026-10-01' } }),
    'no expiry <span class="muted">(per the provider, read 2026-10-01)</span>'
  );
  assert.equal(
    expiryHtml({ no_expiry: { source: '/docs/pricing', checked: '2026-10-01' } }),
    'no expiry <span class="muted">(per the provider, read 2026-10-01)</span>'
  );
});

test('no_expiry with missing or empty source: renders no link', () => {
  assert.equal(
    expiryHtml({ no_expiry: { checked: '2026-10-01' } }),
    'no expiry <span class="muted">(per the provider, read 2026-10-01)</span>'
  );
  assert.equal(
    expiryHtml({ no_expiry: { source: '', checked: '2026-10-01' } }),
    'no expiry <span class="muted">(per the provider, read 2026-10-01)</span>'
  );
});

test('trial-credit with neither field: renders not confirmed', () => {
  assert.equal(
    expiryHtml({ free_type: 'trial-credit' }),
    '<span class="tri tri-unk">not confirmed</span>'
  );
  assert.equal(
    expiryHtml({ free_type: 'trial-credit', expires: null, no_expiry: null }),
    '<span class="tri tri-unk">not confirmed</span>'
  );
});

test('any other free_type with expires null: renders no expiry', () => {
  assert.equal(expiryHtml({ free_type: 'free-tier', expires: null }), 'no expiry');
  assert.equal(expiryHtml({ free_type: 'continuous', expires: null }), 'no expiry');
  assert.equal(expiryHtml({}), 'no expiry');
});

test('precedence: expires takes precedence over no_expiry and trial-credit', () => {
  assert.equal(
    expiryHtml({
      free_type: 'trial-credit',
      expires: '14 days',
      no_expiry: { source: 'https://example.com', checked: '2026-10-01' },
    }),
    '14 days'
  );
});

test('precedence: no_expiry takes precedence over unconfirmed trial-credit', () => {
  assert.equal(
    expiryHtml({
      free_type: 'trial-credit',
      no_expiry: { source: 'https://example.com/terms', checked: '2026-10-01' },
    }),
    'no expiry <span class="muted">(<a href="https://example.com/terms" target="_blank" rel="noopener">per the provider</a>, read 2026-10-01)</span>'
  );
});
