import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicLookup, isPublicAddress, publicHttpsUrlError, resolvePublicRedirect } from './lib/public-fetch.mjs';

test('public URL policy rejects private, metadata and disguised addresses while preserving public HTTPS documentation', () => {
  for (const url of [
    'http://docs.example.com/pricing',
    'https://user:password@docs.example.com/pricing',
    'https://localhost/admin',
    'https://127.0.0.1/admin',
    'https://127.1/admin',
    'https://0x7f000001/admin',
    'https://2130706433/admin',
    'https://10.0.0.1/admin',
    'https://168.63.129.16/machine',
    'https://169.254.169.254/latest/meta-data',
    'https://metadata.google.internal/computeMetadata/v1',
    'https://[::1]/admin',
    'https://[::ffff:7f00:1]/admin',
  ]) assert.ok(publicHttpsUrlError(url), url);
  assert.equal(publicHttpsUrlError('https://docs.example.com/pricing?plan=free'), null);
  assert.equal(publicHttpsUrlError('https://8.8.8.8/'), null);
});

test('address policy covers private IPv4 and IPv6 ranges without rejecting public unicast addresses', () => {
  for (const address of ['0.0.0.0', '10.1.2.3', '100.64.0.1', '172.31.1.2', '192.168.1.2', '224.0.0.1', '::', '::1', 'fc00::1', 'fe80::1', 'ff02::1', '::ffff:10.0.0.1', '2002:0a00:0001::']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  for (const address of ['93.184.216.34', '2606:4700:4700::1111', '::ffff:5db8:d822']) {
    assert.equal(isPublicAddress(address), true, address);
  }
});

const lookupOnce = (lookup, hostname = 'docs.example.com') => new Promise((resolve, reject) => {
  lookup(hostname, {}, (error, address, family) => error ? reject(error) : resolve({ address, family }));
});

test('socket lookup checks every answer and rechecks changed DNS results before connection', async () => {
  const mixed = createPublicLookup((_hostname, options, callback) => {
    assert.equal(options.all, true);
    callback(null, [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.7', family: 4 }]);
  });
  await assert.rejects(lookupOnce(mixed), /non-public address 10\.0\.0\.7/);

  let call = 0;
  const changed = createPublicLookup((_hostname, _options, callback) => {
    call++;
    callback(null, [{ address: call === 1 ? '93.184.216.34' : '169.254.169.254', family: 4 }]);
  });
  assert.deepEqual(await lookupOnce(changed), { address: '93.184.216.34', family: 4 });
  await assert.rejects(lookupOnce(changed), /non-public address 169\.254\.169\.254/);
});

test('redirect policy allows public HTTPS hops and rejects downgrade or private destinations', () => {
  assert.equal(resolvePublicRedirect('https://docs.example.com/start', '/pricing').href, 'https://docs.example.com/pricing');
  assert.equal(resolvePublicRedirect('https://docs.example.com/start', 'https://cdn.example.net/pricing').href, 'https://cdn.example.net/pricing');
  assert.throws(() => resolvePublicRedirect('https://docs.example.com/start', 'http://docs.example.com/pricing'), /must use HTTPS/);
  assert.throws(() => resolvePublicRedirect('https://docs.example.com/start', 'https://127.0.0.1/admin'), /non-public IP/);
});
