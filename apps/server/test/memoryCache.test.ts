import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  clearAllCaches,
  dropCache,
  getCache,
  listCacheStats,
  MemoryCache,
} from '../src/utils/memoryCache.js';

afterEach(() => {
  clearAllCaches();
  dropCache('test-basic');
  dropCache('test-ttl');
  dropCache('test-lru');
  dropCache('test-missing');
  dropCache('test-async');
  dropCache('test-shared-a');
});

describe('MemoryCache', () => {
  it('按 key 读写并统计命中', () => {
    const cache = getCache<string>('test-basic', { maxSize: 10 });
    assert.equal(cache.get('a').hit, false);
    cache.set('a', '1');
    const hit = cache.get('a');
    assert.equal(hit.hit, true);
    if (hit.hit) assert.equal(hit.value, '1');
    const stats = cache.stats();
    assert.equal(stats.hits, 1);
    assert.equal(stats.misses, 1);
    assert.equal(stats.size, 1);
  });

  it('同名缓存共享实例（逐一命名管理）', () => {
    const a = getCache<number>('test-shared-a', { maxSize: 8 });
    const b = getCache<number>('test-shared-a');
    a.set('k', 42);
    const hit = b.get('k');
    assert.equal(hit.hit, true);
    if (hit.hit) assert.equal(hit.value, 42);
    assert.equal(a, b);
  });

  it('支持缺失占位，避免重复回源', () => {
    const cache = getCache<string>('test-missing', {
      maxSize: 8,
      cacheMissing: true,
    });
    let loads = 0;
    const v1 = cache.getOrLoad('gone', () => {
      loads += 1;
      return undefined;
    });
    const v2 = cache.getOrLoad('gone', () => {
      loads += 1;
      return 'should-not-run';
    });
    assert.equal(v1, undefined);
    assert.equal(v2, undefined);
    assert.equal(loads, 1);
    assert.equal(cache.get('gone').hit, true);
  });

  it('TTL 过期后失效', async () => {
    const cache = new MemoryCache<string>({
      name: 'test-ttl-local',
      maxSize: 8,
      ttlMs: 30,
    });
    cache.set('x', 'alive');
    assert.equal(cache.getValue('x'), 'alive');
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(cache.get('x').hit, false);
  });

  it('超出 maxSize 时 LRU 淘汰', () => {
    const cache = getCache<string>('test-lru', { maxSize: 2 });
    cache.set('a', '1');
    cache.set('b', '2');
    // 访问 a，使 b 更旧
    cache.get('a');
    cache.set('c', '3');
    assert.equal(cache.has('a'), true);
    assert.equal(cache.has('c'), true);
    assert.equal(cache.has('b'), false);
  });

  it('getOrLoadAsync 合并并发', async () => {
    const cache = getCache<string>('test-async', { maxSize: 8 });
    let loads = 0;
    const loader = async () => {
      loads += 1;
      await new Promise((r) => setTimeout(r, 20));
      return 'ok';
    };
    const [a, b] = await Promise.all([
      cache.getOrLoadAsync('k', loader),
      cache.getOrLoadAsync('k', loader),
    ]);
    assert.equal(a, 'ok');
    assert.equal(b, 'ok');
    assert.equal(loads, 1);
  });

  it('listCacheStats 可观察各命名空间', () => {
    getCache('test-basic').set('z', '1');
    const names = listCacheStats().map((s) => s.name);
    assert.ok(names.includes('test-basic'));
  });
});
