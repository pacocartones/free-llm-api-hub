import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareTableHtml, clientBundle } from './lib/compare.mjs';

test('compare view labels promotions separately while preserving other offer types', () => {
  const providers = [
    { slug: 'promotion-fixture', name: 'Promotion fixture', category: 'trial', free_type: 'promotion' },
    { slug: 'credit-fixture', name: 'Credit fixture', category: 'trial', free_type: 'trial-credit' },
    { slug: 'renewing-fixture', name: 'Renewing fixture', category: 'ongoing', free_type: 'renewing-quota' },
  ];
  const browser = new Function('window', clientBundle() + '; return window.FLLM_COMPARE;')({});
  for (const render of [compareTableHtml, browser.compareTableHtml]) {
    const row = render(providers).match(/<tr><th[^>]*>Type<\/th>[\s\S]*?<\/tr>/)?.[0];
    assert.ok(row);
    assert.match(row, /<td>Time-limited promotion<\/td>/);
    assert.doesNotMatch(row, /Trial credit · promotion/);
    assert.match(row, /<td>Trial credit · trial-credit<\/td>/);
    assert.match(row, /<td>Ongoing free tier · renewing-quota<\/td>/);
  }
});
