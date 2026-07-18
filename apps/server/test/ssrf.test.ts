import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getOutboundUrlSyncError,
  isBlockedHostname,
  isBlockedIPv4,
  isBlockedIPv6,
  isBlockedIp,
  isSafeHttpUrl,
} from '../src/utils/ssrf.js';
import { isValidHttpUrl } from '../src/services/import/index.js';

describe('ssrf guards', () => {
  it('blocks private and loopback IPv4', () => {
    assert.equal(isBlockedIPv4('127.0.0.1'), true);
    assert.equal(isBlockedIPv4('10.0.0.5'), true);
    assert.equal(isBlockedIPv4('192.168.1.1'), true);
    assert.equal(isBlockedIPv4('172.16.0.1'), true);
    assert.equal(isBlockedIPv4('169.254.169.254'), true);
    assert.equal(isBlockedIPv4('8.8.8.8'), false);
    assert.equal(isBlockedIPv4('1.1.1.1'), false);
  });

  it('blocks loopback and ULA IPv6', () => {
    assert.equal(isBlockedIPv6('::1'), true);
    assert.equal(isBlockedIPv6('fe80::1'), true);
    assert.equal(isBlockedIPv6('fd00::1'), true);
    assert.equal(isBlockedIp('::ffff:127.0.0.1'), true);
  });

  it('blocks dangerous hostnames', () => {
    assert.equal(isBlockedHostname('localhost'), true);
    assert.equal(isBlockedHostname('foo.localhost'), true);
    assert.equal(isBlockedHostname('metadata.google.internal'), true);
    assert.equal(isBlockedHostname('127.0.0.1'), true);
    assert.equal(isBlockedHostname('2130706433'), true); // 127.0.0.1 decimal
    assert.equal(isBlockedHostname('example.com'), false);
  });

  it('sync URL check rejects internal targets', () => {
    assert.equal(isSafeHttpUrl('https://example.com/a'), true);
    assert.equal(isSafeHttpUrl('http://127.0.0.1/admin'), false);
    assert.equal(isSafeHttpUrl('http://localhost:8787/api'), false);
    assert.equal(isSafeHttpUrl('http://192.168.0.1/'), false);
    assert.equal(isSafeHttpUrl('http://169.254.169.254/latest/meta-data/'), false);
    assert.equal(isSafeHttpUrl('ftp://example.com'), false);
    assert.equal(isSafeHttpUrl('http://user:pass@example.com/'), false);
    assert.ok(getOutboundUrlSyncError('http://10.1.2.3/') );
  });

  it('isValidHttpUrl shares the same guard', () => {
    assert.equal(isValidHttpUrl('https://example.com/x'), true);
    assert.equal(isValidHttpUrl('http://127.0.0.1/x'), false);
    assert.equal(isValidHttpUrl('ftp://example.com/x'), false);
  });
});
