import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectScheduleItems } from '../src/services/schedule/runner.js';

describe('selectScheduleItems', () => {
  const items = [
    { key: 'a', url: 'https://example.com/a', title: 'A' },
    { key: 'b', url: 'not-a-url', title: 'B' },
    { key: 'c', url: 'https://example.com/c', title: 'C' },
    { key: 'd', url: 'https://example.com/d', title: 'D' },
  ];

  it('skips invalid urls and seen keys, respects max', () => {
    const seen = new Set(['a']);
    const { selected, skipped } = selectScheduleItems(items, {
      maxItems: 2,
      onlyNew: true,
      isSeen: (k) => seen.has(k),
    });
    assert.equal(selected.length, 2);
    assert.deepEqual(
      selected.map((x) => x.key),
      ['c', 'd'],
    );
    // b invalid + a seen
    assert.equal(skipped, 2);
  });

  it('force-like onlyNew=false keeps seen items', () => {
    const { selected, skipped } = selectScheduleItems(items, {
      maxItems: 3,
      onlyNew: false,
      isSeen: () => true,
    });
    // invalid still skipped
    assert.equal(selected.length, 3);
    assert.equal(skipped, 1);
    assert.equal(selected[0]!.key, 'a');
  });
});
