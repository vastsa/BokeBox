import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mergeConfigSchema,
  normalizeConfigSchema,
} from '../src/plugin-kit/config.js';

describe('plugin-kit config', () => {
  it('normalizes schema fields and drops invalid entries', () => {
    const schema = normalizeConfigSchema([
      { key: 'token', label: 'Token', type: 'string', secret: true, required: true },
      { key: 'region', label: 'Region', type: 'string', required: false, default: 'cn' },
      { key: 'bad key', label: 'Nope', type: 'string' },
      { key: 'noLabel', type: 'string' },
    ]);
    assert.equal(schema.length, 2);
    assert.equal(schema[0]?.key, 'token');
    assert.equal(schema[0]?.secret, true);
    assert.equal(schema[0]?.required, true);
    assert.equal(schema[1]?.default, 'cn');
  });

  it('merges schemas without duplicating keys', () => {
    const base = normalizeConfigSchema([
      { key: 'token', label: 'Token', type: 'string', required: true },
      { key: 'region', label: 'Region', type: 'string', default: 'cn' },
    ]);
    const merged = mergeConfigSchema(base, [
      { key: 'region', label: '区域', type: 'string', default: 'us' },
      { key: 'timeout', label: 'Timeout', type: 'number', default: 30 },
    ]);
    // 同 key 保留先出现的定义，仅追加新 key
    assert.equal(merged.filter((f) => f.key === 'region').length, 1);
    assert.ok(merged.some((f) => f.key === 'token'));
    assert.ok(merged.some((f) => f.key === 'timeout'));
    const region = merged.find((f) => f.key === 'region');
    assert.equal(region?.label, 'Region');
  });
});
