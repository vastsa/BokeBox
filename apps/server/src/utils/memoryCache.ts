/**
 * 进程内内存缓存：按命名空间逐一管理，支持 TTL / LRU / 缺失占位。
 * 用于热点实体读（job / album / listen / settings），写路径负责显式失效。
 */

export type MemoryCacheOptions = {
  /** 缓存命名空间，同名共享同一实例 */
  name: string;
  /** 最大条目数，超出按 LRU 淘汰；默认 500 */
  maxSize?: number;
  /**
   * 条目存活时间（毫秒）。
   * 0 / 未设置表示不过期，仅靠写路径 delete / set 维护一致性。
   */
  ttlMs?: number;
  /**
   * 是否缓存「未命中」结果（undefined / null）。
   * 适合 settings 等 key 稳定、缺失也频繁查询的场景。
   */
  cacheMissing?: boolean;
};

type CacheEntry<T> = {
  value: T;
  /** 0 = 永不过期 */
  expiresAt: number;
  /** 单调访问序号，用于稳定 LRU（避免同毫秒误淘汰） */
  lastAccess: number;
};

export type MemoryCacheStats = {
  name: string;
  size: number;
  maxSize: number;
  ttlMs: number;
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
};

/** 缺失占位：区分「未缓存」与「已确认不存在」 */
const MISSING = Symbol('memory-cache-missing');
type StoredValue<T> = T | typeof MISSING;

const registry = new Map<string, MemoryCache<unknown>>();

export class MemoryCache<T> {
  readonly name: string;
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly cacheMissing: boolean;
  private readonly store = new Map<string, CacheEntry<StoredValue<T>>>();
  private hits = 0;
  private misses = 0;
  private sets = 0;
  private deletes = 0;
  private evictions = 0;
  private accessSeq = 0;

  constructor(opts: MemoryCacheOptions) {
    this.name = opts.name;
    this.maxSize = Math.max(1, opts.maxSize ?? 500);
    this.ttlMs = Math.max(0, opts.ttlMs ?? 0);
    this.cacheMissing = opts.cacheMissing === true;
  }

  get size(): number {
    this.purgeExpired();
    return this.store.size;
  }

  has(key: string): boolean {
    return this.peekEntry(key) !== undefined;
  }

  /**
   * 读取缓存。
   * - hit=true 且 value=undefined：已缓存的缺失
   * - hit=false：未缓存
   */
  get(key: string): { hit: true; value: T | undefined } | { hit: false } {
    const entry = this.peekEntry(key);
    if (!entry) {
      this.misses += 1;
      return { hit: false };
    }
    entry.lastAccess = ++this.accessSeq;
    this.hits += 1;
    if (entry.value === MISSING) {
      return { hit: true, value: undefined };
    }
    return { hit: true, value: entry.value as T };
  }

  /** 便捷读取：未命中返回 fallback */
  getValue(key: string, fallback?: T): T | undefined {
    const got = this.get(key);
    if (!got.hit) return fallback;
    return got.value;
  }

  set(key: string, value: T | undefined | null): void {
    if (value === undefined || value === null) {
      if (!this.cacheMissing) {
        this.delete(key);
        return;
      }
      this.write(key, MISSING);
      return;
    }
    this.write(key, value as T);
  }

  delete(key: string): boolean {
    const existed = this.store.delete(key);
    if (existed) this.deletes += 1;
    return existed;
  }

  /** 按前缀批量失效（例如 album-items:） */
  deleteByPrefix(prefix: string): number {
    let n = 0;
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix) && this.store.delete(key)) {
        n += 1;
        this.deletes += 1;
      }
    }
    return n;
  }

  /** 批量删除指定 keys */
  deleteMany(keys: Iterable<string>): number {
    let n = 0;
    for (const key of keys) {
      if (this.delete(key)) n += 1;
    }
    return n;
  }

  clear(): void {
    const n = this.store.size;
    this.store.clear();
    this.deletes += n;
  }

  keys(): string[] {
    this.purgeExpired();
    return [...this.store.keys()];
  }

  stats(): MemoryCacheStats {
    this.purgeExpired();
    return {
      name: this.name,
      size: this.store.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      deletes: this.deletes,
      evictions: this.evictions,
    };
  }

  /** 同步 get-or-load */
  getOrLoad(key: string, loader: () => T | undefined | null): T | undefined {
    const cached = this.get(key);
    if (cached.hit) return cached.value;
    const value = loader();
    this.set(key, value);
    return value === null ? undefined : (value as T | undefined);
  }

  /** 异步 get-or-load；同一 key 并发只触发一次 loader */
  private inflight = new Map<string, Promise<T | undefined>>();

  async getOrLoadAsync(
    key: string,
    loader: () => Promise<T | undefined | null>,
  ): Promise<T | undefined> {
    const cached = this.get(key);
    if (cached.hit) return cached.value;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const task = (async () => {
      try {
        const value = await loader();
        this.set(key, value);
        return value === null ? undefined : (value as T | undefined);
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, task);
    return task;
  }

  private write(key: string, value: StoredValue<T>): void {
    const now = Date.now();
    const expiresAt = this.ttlMs > 0 ? now + this.ttlMs : 0;
    this.store.set(key, {
      value,
      expiresAt,
      lastAccess: ++this.accessSeq,
    });
    this.sets += 1;
    this.evictIfNeeded();
  }

  private peekEntry(
    key: string,
  ): CacheEntry<StoredValue<T>> | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt > 0 && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      this.evictions += 1;
      return undefined;
    }
    return entry;
  }

  private purgeExpired(): void {
    if (this.ttlMs <= 0) return;
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt > 0 && entry.expiresAt <= now) {
        this.store.delete(key);
        this.evictions += 1;
      }
    }
  }

  private evictIfNeeded(): void {
    if (this.store.size <= this.maxSize) return;
    // LRU：按 lastAccess 升序淘汰
    const entries = [...this.store.entries()].sort(
      (a, b) => a[1].lastAccess - b[1].lastAccess,
    );
    const overflow = this.store.size - this.maxSize;
    for (let i = 0; i < overflow; i += 1) {
      const key = entries[i]?.[0];
      if (!key) break;
      this.store.delete(key);
      this.evictions += 1;
    }
  }
}

/**
 * 获取（或创建）命名缓存实例。
 * 同名多次调用返回同一对象，便于跨模块共享并逐一管理。
 */
export function getCache<T>(
  name: string,
  opts?: Omit<MemoryCacheOptions, 'name'>,
): MemoryCache<T> {
  const existing = registry.get(name);
  if (existing) return existing as MemoryCache<T>;
  const created = new MemoryCache<T>({ name, ...opts });
  registry.set(name, created as MemoryCache<unknown>);
  return created;
}

/** 列出全部命名缓存统计（运维 / 调试） */
export function listCacheStats(): MemoryCacheStats[] {
  return [...registry.values()].map((c) => c.stats());
}

/** 清空全部命名缓存 */
export function clearAllCaches(): void {
  for (const cache of registry.values()) cache.clear();
}

/** 删除命名缓存实例本身（测试用） */
export function dropCache(name: string): boolean {
  const cache = registry.get(name);
  if (!cache) return false;
  cache.clear();
  return registry.delete(name);
}
