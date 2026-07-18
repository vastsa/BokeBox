import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALLOWED_MEDIA_EXT,
  detectSourceKind,
  isValidHttpUrl,
  isPlaceholderTitle,
} from '../src/services/import/index.js';

describe('import kinds', () => {
  it('detects media extensions', () => {
    assert.equal(detectSourceKind('a.mp4', 'video/mp4'), 'video');
    assert.equal(detectSourceKind('a.mp3', 'audio/mpeg'), 'audio');
    assert.equal(detectSourceKind('a.txt', 'text/plain'), 'text');
    assert.ok(ALLOWED_MEDIA_EXT.has('.mp4'));
  });

  it('validates http urls', () => {
    assert.equal(isValidHttpUrl('https://example.com/x'), true);
    assert.equal(isValidHttpUrl('ftp://example.com/x'), false);
    assert.equal(isValidHttpUrl('not-a-url'), false);
  });

  it('detects placeholder titles', () => {
    assert.equal(isPlaceholderTitle(''), true);
    assert.equal(isPlaceholderTitle(null), true);
    assert.equal(isPlaceholderTitle('https://example.com/a'), true);
    assert.equal(isPlaceholderTitle('URL 导入'), true);
    assert.equal(isPlaceholderTitle('example.com'), true);
    assert.equal(isPlaceholderTitle('深度长文解读'), false);
  });
});
