import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveJobSourcePluginId,
  selectScheduleItems,
} from '../src/services/schedule/runner.js';

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

  it('dedupes keys within the same batch', () => {
    const batch = [
      { key: 'same', url: 'https://example.com/1', title: '1' },
      { key: 'same', url: 'https://example.com/2', title: '2' },
      { key: 'other', url: 'https://example.com/3', title: '3' },
    ];
    const { selected, skipped } = selectScheduleItems(batch, {
      maxItems: 5,
      onlyNew: true,
      isSeen: () => false,
    });
    assert.equal(selected.length, 2);
    assert.equal(selected[0]!.url, 'https://example.com/1');
    assert.equal(selected[1]!.key, 'other');
    assert.equal(skipped, 1);
  });

  it('skips empty keys', () => {
    const batch = [
      { key: '', url: 'https://example.com/x', title: 'x' },
      { key: 'ok', url: 'https://example.com/y', title: 'y' },
    ];
    const { selected, skipped } = selectScheduleItems(batch, {
      maxItems: 5,
      onlyNew: false,
      isSeen: () => false,
    });
    assert.equal(selected.length, 1);
    assert.equal(selected[0]!.key, 'ok');
    assert.equal(skipped, 1);
  });
});


describe('resolveJobSourcePluginId', () => {
  it('prefers sourcePluginId over pluginId', () => {
    assert.equal(
      resolveJobSourcePluginId({
        sourcePluginId: 'source.foo',
        pluginId: 'source.bar',
      }),
      'source.foo',
    );
  });

  it('falls back to pluginId and ignores schedule.*', () => {
    assert.equal(
      resolveJobSourcePluginId({ pluginId: 'source.direct-http' }),
      'source.direct-http',
    );
    assert.equal(
      resolveJobSourcePluginId({ pluginId: 'schedule.rss' }),
      undefined,
    );
    assert.equal(resolveJobSourcePluginId({}), undefined);
    assert.equal(resolveJobSourcePluginId(null), undefined);
  });
});
