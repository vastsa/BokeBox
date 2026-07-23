import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cronFromPreset,
  getNextRunAt,
  isValidCron,
  parseCron,
} from '../src/services/schedule/cron.js';

describe('schedule cron', () => {
  it('parses 5-field expressions', () => {
    const f = parseCron('0 8 * * 1');
    assert.ok(f);
    assert.deepEqual(f!.minute, [0]);
    assert.deepEqual(f!.hour, [8]);
    assert.deepEqual(f!.dayOfWeek, [1]);
  });

  it('supports steps and lists', () => {
    const f = parseCron('*/15 0,12 * * *');
    assert.ok(f);
    assert.equal(f!.minute.length, 4);
    assert.deepEqual(f!.hour, [0, 12]);
  });

  it('rejects invalid expressions', () => {
    assert.equal(isValidCron(''), false);
    assert.equal(isValidCron('* * *'), false);
    assert.equal(isValidCron('60 * * * *'), false);
    assert.equal(isValidCron('0 8 * * 1'), true);
  });

  it('maps presets to cron', () => {
    assert.equal(cronFromPreset('daily'), '0 8 * * *');
    assert.equal(cronFromPreset('hourly'), '0 * * * *');
    assert.equal(cronFromPreset('cron', '5 9 * * *'), '5 9 * * *');
  });

  it('computes next run in timezone', () => {
    // 固定：2026-07-23 00:00:00 UTC → 上海 08:00
    const from = new Date('2026-07-23T00:00:00.000Z');
    const next = getNextRunAt('0 9 * * *', 'Asia/Shanghai', from);
    assert.ok(next);
    // 上海 09:00 = UTC 01:00 同日
    assert.equal(next, '2026-07-23T01:00:00.000Z');
  });
});
