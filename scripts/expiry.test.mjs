import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expiryHtml } from './lib/expiry.mjs';

test('expires set is shown as is', () => {
  const html = expiryHtml({ expires: '30 days' });
  assert.equal(html, '30 days');
});

test('expires set is HTML-escaped', () => {
  const html = expiryHtml({ expires: '<30 days & "soon">' });
  assert.equal(html, '&lt;30 days &amp; &quot;soon&quot;&gt;');
});

test('no_expiry with an https:// source links per the provider with the reading date', () => {
  const p = {
    no_expiry: {
      source: 'https://example.com/terms',
      checked: '2026-10-14',
    },
  };
  const html = expiryHtml(p);
  assert.equal(
    html,
    'no expiry <span class="muted">(<a href="https://example.com/terms" target="_blank" rel="noopener">per the provider</a>, read 2026-10-14)</span>'
  );
});

test('no_expiry with missing source renders no link', () => {
  const p = {
    no_expiry: {
      source: '',
      checked: '2026-10-14',
    },
  };
  const html = expiryHtml(p);
  assert.equal(html, 'no expiry <span class="muted">(per the provider, read 2026-10-14)</span>');
});

test('no_expiry with non-http source (e.g. javascript:) renders no link', () => {
  const p = {
    no_expiry: {
      source: 'javascript:alert(1)',
      checked: '2026-10-14',
    },
  };
  const html = expiryHtml(p);
  assert.equal(html, 'no expiry <span class="muted">(per the provider, read 2026-10-14)</span>');
});

test('trial-credit with neither field returns not confirmed', () => {
  const p = { free_type: 'trial-credit' };
  const html = expiryHtml(p);
  assert.equal(html, '<span class="tri tri-unk">not confirmed</span>');
});

test('any other free_type with expires null returns no expiry', () => {
  assert.equal(expiryHtml({ free_type: 'perpetual', expires: null }), 'no expiry');
  assert.equal(expiryHtml({ free_type: 'renewing-quota', expires: null }), 'no expiry');
  assert.equal(expiryHtml({ free_type: 'recurring-credit', expires: null }), 'no expiry');
});
